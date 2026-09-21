/** Latest sourced FX quotes, with a seven-calendar-day freshness bound and no synthetic fallback. */
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { MoneyDecimal, type UsdRates } from "@/lib/money"

export const ECB_SOURCE = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
export const CBUAE_SOURCE = "https://centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency"
const CBUAE_MAX_BYTES = 512 * 1024
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

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

/** CBUAE publishes AED per foreign unit. Only its dated US Dollar row is inverted. */
export function parseCbuaeAedRate(html: string, now = new Date()) {
  if (html.length > CBUAE_MAX_BYTES) throw new Error("CBUAE response exceeds the size limit")
  const plain = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim()
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => plain(match[1]))
  if (!paragraphs.includes("Exchange rates against UAE Dirham for VAT related obligations")) throw new Error("CBUAE quote units are unverified")
  const dates = paragraphs.filter((value) => value.startsWith("Last updated:"))
  const date = dates.length === 1 ? dates[0].match(/^Last updated: (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (\d{1,2}) ([A-Za-z]+) (\d{4}) (?:0[1-9]|1[0-2]):[0-5]\d:[0-5]\d (?:AM|PM)$/) : null
  if (!date) throw new Error("CBUAE response has no unambiguous publication date")
  const month = MONTHS.indexOf(date[2])
  const isoDate = `${date[3]}-${String(month + 1).padStart(2, "0")}-${date[1].padStart(2, "0")}`
  const published = new Date(`${isoDate}T00:00:00Z`)
  if (month < 0 || !Number.isFinite(published.getTime()) || published.toISOString().slice(0, 10) !== isoDate) throw new Error("CBUAE publication date is invalid")
  if (published > now || now.getTime() - published.getTime() > 7 * 86400000) throw new Error("CBUAE rates are stale or future dated")
  const dollarRows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((row) => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => plain(cell[1])))
    .filter((cells) => cells.includes("US Dollar"))
  if (dollarRows.length !== 1 || dollarRows[0].length !== 3 || dollarRows[0][1] !== "US Dollar") throw new Error("CBUAE US Dollar quote is absent or ambiguous")
  const quote = dollarRows[0][2]
  if (!/^\d{1,12}(?:\.\d{1,12})?$/.test(quote)) throw new Error("CBUAE US Dollar quote is invalid")
  const aedPerUsd = new MoneyDecimal(quote)
  if (aedPerUsd.lte(0)) throw new Error("CBUAE US Dollar quote must be positive")
  const usdPerAed = new MoneyDecimal(1).div(aedPerUsd).toDecimalPlaces(12)
  if (usdPerAed.lte(0) || usdPerAed.gte("1000000000000")) throw new Error("CBUAE inverse exceeds stored quote precision")
  return { currency: "AED", usd_rate: usdPerAed, rate_date: published, source_url: CBUAE_SOURCE }
}

/** Public read-only fetch, bounded even when the upstream omits Content-Length. */
export async function fetchCbuaeAedRate(now = new Date()) {
  const response = await fetch(CBUAE_SOURCE, { signal: AbortSignal.timeout(15000), cache: "no-store", redirect: "error" })
  if (!response.ok) throw new Error(`CBUAE unavailable (${response.status})`)
  if (Number(response.headers.get("content-length")) > CBUAE_MAX_BYTES) throw new Error("CBUAE response exceeds the size limit")
  if (!response.body) throw new Error("CBUAE response is empty")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > CBUAE_MAX_BYTES) throw new Error("CBUAE response exceeds the size limit")
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => undefined) }
  return parseCbuaeAedRate(Buffer.concat(chunks).toString("utf8"), now)
}

export async function refreshCbuaeAedRate() {
  const row = await fetchCbuaeAedRate()
  await prisma.fxRate.upsert({
    where: { currency_rate_date_source_url: { currency: row.currency, rate_date: row.rate_date, source_url: row.source_url } },
    create: row,
    update: { usd_rate: row.usd_rate, fetched_at: new Date() },
  })
  return 1
}

/** Each source succeeds or fails independently; successful persisted quotes are the refresh receipt. */
export async function refreshReferenceRates(staleBefore?: Date) {
  return Promise.all([
    { source: ECB_SOURCE, refresh: refreshEcbRates },
    { source: CBUAE_SOURCE, refresh: refreshCbuaeAedRate },
  ].map(async ({ source, refresh }) => {
    try {
      if (staleBefore && await prisma.fxRate.findFirst({ where: { source_url: source, fetched_at: { gte: staleBefore } } })) return { source, status: "fresh" as const, count: 0 }
      return { source, status: "refreshed" as const, count: await refresh() }
    } catch (error) {
      return { source, status: "failed" as const, error: error instanceof Error ? error.message : "Unknown FX refresh failure" }
    }
  }))
}
