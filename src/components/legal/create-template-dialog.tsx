"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { createTemplate } from "@/actions/templates"
import { ENTITIES } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const CATEGORIES = [
  "NDA",
  "SPONSORSHIP",
  "VENDOR",
  "EMPLOYMENT",
  "ESOP",
  "MSA",
  "SLA",
  "CONTRACTOR",
  "REFERRAL_PARTNER",
  "VENUE",
  "PRODUCTION_PARTNER",
  "SAAS_SUBSCRIPTION",
  "INSURANCE",
  "POLICY",
  "OTHER",
]

export function CreateTemplateDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)

    startTransition(async () => {
      setError(null)
      const result = await createTemplate(formData)
      if (!result.success) {
        setError(result.error ?? "Template could not be created")
        return
      }
      form.reset()
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Plus className="size-4" />
        Create Template
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Template</DialogTitle>
          <DialogDescription>
            Add a reusable contract template for the generation workflow.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="template-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="template-name"
                name="name"
                placeholder="Mutual NDA"
                required
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="template-category" className="text-sm font-medium">
                Category
              </label>
              <select
                id="template-category"
                name="category"
                defaultValue="NDA"
                required
                className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="template-entity" className="text-sm font-medium">
              Company
            </label>
            <select
              id="template-entity"
              name="entity"
              defaultValue=""
              className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="">Any company</option>
              {ENTITIES.map((entity) => (
                <option key={entity.value} value={entity.value}>
                  {entity.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="template-variables" className="text-sm font-medium">
              Variables
            </label>
            <Input
              id="template-variables"
              name="variables"
              placeholder="counterparty, effective_date, governing_law"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="template-content" className="text-sm font-medium">
              Template content
            </label>
            <Textarea
              id="template-content"
              name="content"
              required
              rows={12}
              className="min-h-72 font-mono text-sm"
              placeholder="This Mutual Non-Disclosure Agreement is entered into between {{company}} and {{counterparty}}..."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              <Plus className="size-4" />
              {isPending ? "Creating..." : "Create Template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
