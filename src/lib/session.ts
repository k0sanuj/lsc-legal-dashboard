import { cookies } from "next/headers"
import type { UserRole } from "@/generated/prisma/client"

const COOKIE_NAME = "lsc_legal_session"
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export interface SessionPayload {
  userId: string
  email: string
  role: UserRole
  fullName: string
  exp: number
}

function getSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SESSION_SECRET must be set and at least 32 characters"
    )
  }
  return secret
}

// Use Web Crypto API (edge-compatible) for HMAC signing
async function getKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  )
}

async function sign(payload: string): Promise<string> {
  const key = await getKey()
  const encoder = new TextEncoder()
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  )
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
}

async function verify(payload: string, signature: string): Promise<boolean> {
  const expected = await sign(payload)
  return signature === expected
}

export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
  const signature = await sign(encoded)
  return `${encoded}.${signature}`
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const parts = token.split(".")
    if (parts.length !== 2) return null
    const [encoded, signature] = parts

    const isValid = await verify(encoded, signature)
    if (!isValid) return null

    // Decode base64url
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/")
    const payload = JSON.parse(atob(padded)) as SessionPayload

    if (payload.exp < Date.now()) return null

    return payload
  } catch {
    return null
  }
}

export async function setSessionCookie(
  payload: Omit<SessionPayload, "exp">
) {
  const sessionPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + SESSION_DURATION_MS,
  }

  const token = await createSessionToken(sessionPayload)
  const cookieStore = await cookies()

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  })
}

export async function getSessionFromCookie(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySessionToken(token)
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}
