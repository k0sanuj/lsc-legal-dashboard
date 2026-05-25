import { NextRequest, NextResponse } from "next/server"
import { logoutCurrentUser } from "@/lib/auth"

export async function POST(request: NextRequest) {
  await logoutCurrentUser()
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 })
}
