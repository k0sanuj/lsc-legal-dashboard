"use client"

import { useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Upload } from "lucide-react"
import { analyzeTemplateUpload, createTemplate } from "@/actions/templates"
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
  "SPONSORSHIP",
  "VENDOR",
  "EMPLOYMENT",
  "ESOP",
  "NDA",
  "ARENA_HOST",
  "TERMS_OF_SERVICE",
  "WAIVER",
  "IP_ASSIGNMENT",
  "PILOT_PROGRAM",
  "BOARD_RESOLUTION",
  "POLICY",
  "OTHER",
  "MSA",
  "SLA",
  "CONTRACTOR",
  "REFERRAL_PARTNER",
  "VENUE",
  "PRODUCTION_PARTNER",
  "CLICKWRAP",
  "REGISTERED_OFFICE",
  "SAAS_SUBSCRIPTION",
  "INSURANCE",
  "GOVERNMENT_FILING",
  "LITIGATION_DOC",
  "SUBSIDY_GRANT",
]

type CreateTemplateDialogProps = {
  mode?: "manual" | "upload"
}

function defaultFields() {
  return {
    name: "",
    category: "NDA",
    entity: "",
    variables: "",
    content: "",
    fileName: "",
  }
}

export function CreateTemplateDialog({ mode = "manual" }: CreateTemplateDialogProps) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isAnalyzing, startAnalysisTransition] = useTransition()
  const [fields, setFields] = useState(defaultFields)
  const isUploadMode = mode === "upload"
  const title = isUploadMode ? "Upload Agreement" : "Create Template"
  const actionLabel = isUploadMode ? "Save Template" : "Create Template"
  const TriggerIcon = isUploadMode ? Upload : Plus
  const idPrefix = isUploadMode ? "upload-template" : "create-template"
  const canSave = !isUploadMode || Boolean(fields.content.trim())

  function resetFields() {
    setFields(defaultFields())
    setError(null)
  }

  function updateField(key: keyof ReturnType<typeof defaultFields>, value: string) {
    setFields((current) => ({ ...current, [key]: value }))
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    updateField("fileName", file.name)
    setError(null)

    const formData = new FormData()
    formData.set("file", file)

    startAnalysisTransition(async () => {
      const result = await analyzeTemplateUpload(formData)
      if (!result.success) {
        setError(result.error)
        updateField("content", "")
        return
      }

      setFields({
        name: result.fields.name,
        category: result.fields.category,
        entity: result.fields.entity,
        variables: result.fields.variablesText,
        content: result.fields.content,
        fileName: file.name,
      })
    })
  }

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
      resetFields()
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) resetFields()
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <TriggerIcon className="size-4" />
        {title}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isUploadMode
              ? "Turn an existing agreement into a reusable generation template."
              : "Add a reusable contract template for the generation workflow."}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {isUploadMode && (
            <div className="space-y-2">
              <label htmlFor={`${idPrefix}-file`} className="text-sm font-medium">
                Agreement file
              </label>
              <input
                id={`${idPrefix}-file`}
                name="file"
                type="file"
                required
                accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                onChange={handleFileChange}
                className="block h-10 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
              <div className="min-h-5 text-xs text-muted-foreground" aria-live="polite">
                {isAnalyzing ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-3 animate-spin" />
                    Analyzing agreement...
                  </span>
                ) : fields.fileName && fields.content ? (
                  <span>{fields.fileName} analyzed</span>
                ) : null}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor={`${idPrefix}-name`} className="text-sm font-medium">
                Name
              </label>
              <Input
                id={`${idPrefix}-name`}
                name="name"
                placeholder={isUploadMode ? "Derived from file if blank" : "Mutual NDA"}
                required={!isUploadMode}
                value={fields.name}
                onChange={(event) => updateField("name", event.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor={`${idPrefix}-category`} className="text-sm font-medium">
                Category
              </label>
              <select
                id={`${idPrefix}-category`}
                name="category"
                value={fields.category}
                onChange={(event) => updateField("category", event.target.value)}
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
            <label htmlFor={`${idPrefix}-entity`} className="text-sm font-medium">
              Company
            </label>
            <select
              id={`${idPrefix}-entity`}
              name="entity"
              value={fields.entity}
              onChange={(event) => updateField("entity", event.target.value)}
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
            <label htmlFor={`${idPrefix}-variables`} className="text-sm font-medium">
              Variables
            </label>
            <Textarea
              id={`${idPrefix}-variables`}
              name="variables"
              rows={3}
              value={fields.variables}
              onChange={(event) => updateField("variables", event.target.value)}
              placeholder={"counterparty\neffective_date\ngoverning_law"}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor={`${idPrefix}-content`} className="text-sm font-medium">
              Template content
            </label>
            <Textarea
              id={`${idPrefix}-content`}
              name="content"
              required={!isUploadMode}
              rows={12}
              className="min-h-72 font-mono text-sm"
              value={fields.content}
              onChange={(event) => updateField("content", event.target.value)}
              placeholder="This Mutual Non-Disclosure Agreement is entered into between {{company}} and {{counterparty}}..."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || isAnalyzing || !canSave}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <TriggerIcon className="size-4" />}
              {isPending ? "Saving..." : actionLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
