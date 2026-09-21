"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/auth"
import { requireGlobalDocumentAccess } from "@/lib/document-access"
import { prisma } from "@/lib/prisma"
import { queueDocumentExport, requireExportAccess } from "@/lib/document-exports"
import { currencyCode, decimalAmount } from "@/lib/money"
import { refreshEcbRates } from "@/lib/fx-rates"
import { proposeArtifactNameForActor, approveArtifactNameForActor, finalizeArtifactForActor, publishArtifactForActor, updateArtifactLineageForActor, updateNativeAmountForActor } from "@/lib/repository-service"

function text(form: FormData, key: string) { return String(form.get(key) ?? "").trim() }

export async function proposeArtifactName(form: FormData) {
  await proposeArtifactNameForActor(await requireSession(), form)
  revalidatePath("/legal/repositories")
}

export async function approveArtifactName(form: FormData) {
  await approveArtifactNameForActor(await requireSession(), form)
  revalidatePath("/legal/repositories")
}

export async function finalizeArtifact(form: FormData) {
  await finalizeArtifactForActor(await requireSession(), form)
  revalidatePath("/legal/repositories")
}

export async function publishArtifact(form: FormData) {
  await publishArtifactForActor(await requireSession(), form)
  revalidatePath("/legal/repositories")
}

export async function updateArtifactLineage(form: FormData) {
  await updateArtifactLineageForActor(await requireSession(), form)
  revalidatePath("/legal/repositories")
}

export async function approveNamingCode(form: FormData) {
  const session = await requireGlobalDocumentAccess()
  const code = text(form, "code").toUpperCase()
  const label = text(form, "label")
  if (!/^[A-Z]{3}$/.test(code) || !label) throw new Error("Three uppercase letters and the full category name are required")
  await prisma.namingCode.upsert({ where: { kind_code: { kind: "category", code } }, create: { kind: "category", code, label, approved_by: session.userId }, update: { label, approved_by: session.userId } })
  revalidatePath("/legal/file-naming")
  revalidatePath("/legal/repositories")
}

export async function startDocumentExport() {
  await queueDocumentExport(await requireSession())
  redirect("/legal/backups")
}

export async function verifyDocumentExport(form: FormData) {
  const session = await requireSession()
  const job = await prisma.documentExport.findFirst({ where: { id: text(form, "exportId"), requested_by: session.userId } })
  if (!job || job.status !== "complete" || !job.downloaded_at) throw new Error("Download a complete export before recording your manual verification")
  await requireExportAccess(session, job.snapshot)
  await prisma.documentExport.update({ where: { id: job.id }, data: { verified_at: new Date() } })
  revalidatePath("/legal/backups")
}

export async function updateNativeAmount(form: FormData) {
  await updateNativeAmountForActor(await requireSession(), form)
  revalidatePath(`/legal/documents/${text(form, "documentId")}`)
  revalidatePath("/legal/agreements")
  revalidatePath("/legal")
}

export async function refreshFx() {
  await requireGlobalDocumentAccess()
  await refreshEcbRates()
  revalidatePath("/legal/currencies")
  revalidatePath("/legal/agreements")
}

export async function saveSourcedFx(form: FormData) {
  await requireGlobalDocumentAccess()
  const currency = currencyCode(text(form, "currency"))
  const rate = decimalAmount(text(form, "rate"))
  const dateText = text(form, "date")
  const date = new Date(`${dateText}T00:00:00Z`)
  const source = new URL(text(form, "source"))
  if (!currency || currency === "USD" || rate.lte(0) || source.protocol !== "https:" || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateText || date > new Date()) throw new Error("Supply a non-USD currency, positive USD rate, dated HTTPS source and publication date")
  await prisma.fxRate.upsert({ where: { currency_rate_date_source_url: { currency, rate_date: date, source_url: source.toString() } }, create: { currency, usd_rate: rate, rate_date: date, source_url: source.toString() }, update: { usd_rate: rate, fetched_at: new Date() } })
  revalidatePath("/legal/currencies")
}
