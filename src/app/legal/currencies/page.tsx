import { requireGlobalDocumentAccess } from "@/lib/document-access"
import { loadUsdRates } from "@/lib/fx-rates"
import { refreshFx, saveSourcedFx } from "@/actions/repositories"

export default async function CurrenciesPage() {
  await requireGlobalDocumentAccess()
  const rates = await loadUsdRates()
  const field = "rounded border border-input bg-background px-3 py-2"
  return <div className="space-y-6"><h1 className="text-2xl font-semibold">Currency reference</h1><p className="text-sm text-muted-foreground">USD is the reporting default. Agreement values keep their native currency. Reference quotes expire after seven calendar days; missing conversions stay unavailable. ECB publishes reference rates on working days and does not cover every currency.</p><form action={refreshFx}><button className={field}>Refresh from European Central Bank</button></form><table className="w-full text-left text-sm"><thead><tr><th>Currency</th><th>USD per unit</th><th>Published</th><th>Source</th></tr></thead><tbody>{[...rates].map(([currency, quote]) => <tr key={currency} className="border-t border-border"><td className="py-3">{currency}</td><td className="font-mono tabular-nums">{quote.rate.toFixed(8)}</td><td>{quote.date.toISOString().slice(0, 10)}</td><td><a className="text-primary underline" href={quote.source} target="_blank" rel="noopener noreferrer">Source</a></td></tr>)}</tbody></table><h2 className="text-lg font-medium">Record a verified source quote</h2><form action={saveSourcedFx} className="flex flex-wrap gap-3"><input name="currency" placeholder="Currency, e.g. AED" required pattern="[A-Z]{3}" className={field}/><input name="rate" placeholder="USD per one native unit" required inputMode="decimal" className={field}/><input type="date" name="date" aria-label="Source publication date" required className={field}/><input type="url" name="source" placeholder="HTTPS source URL" required className={field}/><button className={field}>Save sourced quote</button></form></div>
}
