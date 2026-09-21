/** Native money remains decimal throughout calculation and serialization. USD is reporting only. */
import { Prisma } from "@/generated/prisma/client"

// Default database decimals hold up to 65 digits. FX multiplication and aggregation
// use a private 128-digit context so Prisma's 20-digit default cannot drop cents.
export const MoneyDecimal = Prisma.Decimal.clone({ precision: 128 })

export type Money = Prisma.Decimal | string | null
export type UsdRates = ReadonlyMap<string, { rate: Prisma.Decimal; date: Date; source: string }>

export function currencyCode(value: unknown): string | null {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : null
}

export function decimalAmount(value: string): Prisma.Decimal {
  if (!/^-?\d{1,35}(?:\.\d{1,8})?$/.test(value.trim())) throw new Error("Enter a decimal amount with up to 35 integer digits and eight decimal places")
  return new MoneyDecimal(value.trim())
}

export function formatMoney(amount: Money, currency: string): string {
  if (amount === null) return "Unknown"
  const value = new MoneyDecimal(amount)
  if (!value.isFinite() || !currencyCode(currency)) return "Unknown"
  const digits = new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2
  const fixed = value.abs().toFixed(digits)
  const [whole, fraction] = fixed.split(".")
  const grouped = new Intl.NumberFormat("en-US").format(BigInt(whole))
  return `${currency} ${value.isNegative() ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`
}

export function toUsd(amount: Money, currency: string, rates: UsdRates): Prisma.Decimal | null {
  if (amount === null) return null
  if (currency === "USD") return new MoneyDecimal(amount)
  const quote = rates.get(currency)
  return quote ? new MoneyDecimal(amount).mul(quote.rate) : null
}

export function agreementMoney(amount: Money, currency: string, rates: UsdRates): string {
  const native = formatMoney(amount, currency)
  if (currency === "USD" || amount === null) return native
  const usd = toUsd(amount, currency, rates)
  return `${native} (${usd === null ? "USD unavailable" : formatMoney(usd, "USD")})`
}

export function usdTotal(rows: readonly { value: Money; currency: string }[], rates: UsdRates) {
  let total = new MoneyDecimal(0)
  let missing = 0
  for (const row of rows) {
    const converted = toUsd(row.value, row.currency, rates)
    if (converted === null) missing += 1
    else total = total.plus(converted)
  }
  return { total, missing, included: rows.length - missing }
}
