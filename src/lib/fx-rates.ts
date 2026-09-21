/** Latest sourced FX quotes, with a seven-calendar-day freshness bound and no synthetic fallback. */
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { MoneyDecimal, type UsdRates } from "@/lib/money"

export const ECB_SOURCE = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"

export async function loadUsdRates(now = new Date()): Promise<UsdRates> {
  const earliest = new Date(now.getTime() - 7 * 86400000)
  const rows = await prisma.fxRate.findMany({
    where: { rate_date: { gte: earliest, lte: now } },
    orderBy: [{ rate_date: "desc" }, { fetched_at: "desc" }],
  })
  const rates = new Map<string, { rate: Prisma.Decimal; date: Date; source: string }>()
  for (const row of rows) {
    if (!rates.has(row.currency) && row.usd_rate.gt(0)) rates.set(row.currency, { rate: row.usd_rate, date: row.rate_date, source: row.source_url })
  }
  return rates
}

export function parseEcbRates(xml: string, now = new Date()) {
  const date = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1]
  if (!date) throw new Error("ECB response has no publication date")
  const published = new Date(`${date}T00:00:00Z`)
  if (published > now || now.getTime() - published.getTime() > 7 * 86400000) throw new Error("ECB rates are stale or future dated")
  const eurRates = new Map<string, Prisma.Decimal>([["EUR", new MoneyDecimal(1)]])
  for (const match of xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/?\s*>/g)) {
    const rate = new MoneyDecimal(match[2])
    if (!rate.isFinite() || rate.lte(0)) throw new Error("Invalid ECB quote")
    eurRates.set(match[1], rate)
  }
  const eurUsd = eurRates.get("USD")
  if (!eurUsd) throw new Error("ECB USD quote is absent")
  return [...eurRates].map(([currency, rate]) => ({ currency, usd_rate: eurUsd.div(rate), rate_date: published, source_url: ECB_SOURCE }))
}

export async function refreshEcbRates() {
  const response = await fetch(ECB_SOURCE, { signal: AbortSignal.timeout(15000), cache: "no-store" })
  if (!response.ok) throw new Error(`ECB unavailable (${response.status})`)
  const rows = parseEcbRates(await response.text())
  await prisma.$transaction(rows.map((row) => prisma.fxRate.upsert({
    where: { currency_rate_date_source_url: { currency: row.currency, rate_date: row.rate_date, source_url: row.source_url } },
    create: row,
    update: { usd_rate: row.usd_rate, fetched_at: new Date() },
  })))
  return rows.length
}
