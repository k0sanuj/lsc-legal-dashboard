"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, PenTool, Plus, Trash2 } from "lucide-react"
import { createOpenSignSignatureRequest } from "@/actions/opensign"
import { createSignatureRequest, deleteSignatureRequest } from "@/actions/signatures"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { OpenSignFieldPlacement, OpenSignSetupStatus } from "@/lib/opensign"
import type { SignatureStatus } from "@/generated/prisma/client"

type Signer = {
  id: string
  signatory_name: string
  signatory_email: string
  status: SignatureStatus
  sent_at: Date | null
  viewed_at?: Date | null
  signed_at: Date | null
  declined_at?: Date | null
  signing_url: string | null
}

type FieldType = OpenSignFieldPlacement["type"]

// x/y/w/h are percentages (0-100) of the page box, origin top-left. They are
// divided by 100 on submit to form the normalized OpenSignFieldPlacement.
type FieldDraft = {
  id: string
  signerEmail: string
  type: FieldType
  page: number
  x: number
  y: number
  w: number
  h: number
  label: string
  required: boolean
}

const STATUS_STYLES: Record<SignatureStatus, string> = {
  PENDING: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  SENT: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  SIGNED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  STALLED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
}

const FIELD_DEFAULTS: Record<FieldType, Pick<FieldDraft, "w" | "h" | "label">> = {
  signature: { w: 28, h: 7, label: "Signature" },
  initials: { w: 10, h: 5, label: "Initials" },
  date: { w: 16, h: 3, label: "Date" },
  "text input": { w: 30, h: 3, label: "Text" },
  name: { w: 28, h: 3, label: "Name" },
  email: { w: 30, h: 3, label: "Email" },
}

function newField(signerEmail: string, type: FieldType = "signature"): FieldDraft {
  const defaults = FIELD_DEFAULTS[type]
  return {
    id: crypto.randomUUID(),
    signerEmail,
    type,
    page: 1,
    x: 8,
    y: type === "date" ? 72 : 62,
    w: defaults.w,
    h: defaults.h,
    label: defaults.label,
    required: true,
  }
}

// Serializes drafts to the normalized { [email]: OpenSignFieldPlacement[] }
// map the server action expects: percentages become fractions of the page box.
function buildWidgetsJson(fields: FieldDraft[]) {
  const bySigner: Record<string, OpenSignFieldPlacement[]> = {}
  for (const field of fields) {
    const placements = (bySigner[field.signerEmail] ??= [])
    placements.push({
      page: field.page,
      xPct: field.x / 100,
      yPct: field.y / 100,
      wPct: field.w / 100,
      hPct: field.h / 100,
      type: field.type,
      required: field.required,
      // Shown to the signer as help text on the field (options.hint).
      label: field.label,
    })
  }
  return JSON.stringify(bySigner)
}

export function SignaturePrepPanel({
  documentId,
  hasFile,
  signers,
  openSignStatus,
}: {
  documentId: string
  hasFile: boolean
  signers: Signer[]
  openSignStatus: OpenSignSetupStatus
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [selectedSignerEmail, setSelectedSignerEmail] = useState("")
  const [fieldType, setFieldType] = useState<FieldDraft["type"]>("signature")
  const [fields, setFields] = useState<FieldDraft[]>([])
  const [isAddingSigner, startAddSignerTransition] = useTransition()
  const [isRemovingSigner, startRemoveSignerTransition] = useTransition()
  const [isSending, startSendTransition] = useTransition()

  const pendingSigners = useMemo(
    () => signers.filter((signer) => signer.status === "PENDING"),
    [signers]
  )
  const sentOrSigned = signers.filter((signer) => signer.status !== "PENDING")
  const activeSignerEmail = pendingSigners.some(
    (signer) => signer.signatory_email === selectedSignerEmail
  )
    ? selectedSignerEmail
    : pendingSigners[0]?.signatory_email ?? ""
  const selectedSigner = pendingSigners.find(
    (signer) => signer.signatory_email === activeSignerEmail
  )
  const canSend = hasFile && pendingSigners.length > 0 && openSignStatus.configured

  function handleAddSigner() {
    const formData = new FormData()
    formData.set("documentId", documentId)
    formData.set("signatoryName", name)
    formData.set("signatoryEmail", email)

    startAddSignerTransition(async () => {
      const result = await createSignatureRequest(formData)
      if (!result.success) {
        toast.error("Could not add signer", { description: result.error })
        return
      }
      setName("")
      setEmail("")
      toast.success("Signer added")
      router.refresh()
    })
  }

  function handleRemoveSigner(requestId: string) {
    const formData = new FormData()
    formData.set("requestId", requestId)

    startRemoveSignerTransition(async () => {
      const result = await deleteSignatureRequest(formData)
      if (!result.success) {
        toast.error("Could not remove signer", { description: result.error })
        return
      }
      toast.success("Signer removed")
      router.refresh()
    })
  }

  function handleAddField() {
    if (!activeSignerEmail) return
    setFields((current) => [...current, newField(activeSignerEmail, fieldType)])
  }

  function updateField(id: string, patch: Partial<FieldDraft>) {
    setFields((current) =>
      current.map((field) => (field.id === id ? { ...field, ...patch } : field))
    )
  }

  function handleSend() {
    const formData = new FormData()
    formData.set("documentId", documentId)
    if (fields.length > 0) formData.set("widgetsJson", buildWidgetsJson(fields))

    startSendTransition(async () => {
      const result = await createOpenSignSignatureRequest(formData)
      if (!result.success) {
        toast.error("OpenSign request failed", { description: result.error })
        return
      }
      toast.success("Sent via OpenSign")
      setFields([])
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/50 bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <PenTool className="size-4 text-violet-400" />
            <h3 className="text-sm font-semibold">E-signature prep</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Add signers, place fields, then send the document through OpenSign.
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            openSignStatus.configured
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
          }
        >
          {openSignStatus.configured ? "OpenSign ready" : "OpenSign setup pending"}
        </Badge>
      </div>

      {!openSignStatus.configured ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-3.5" />
            Missing env: {openSignStatus.missing.join(", ")}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Signer name"
              autoComplete="name"
            />
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="signer@example.com"
              type="email"
              autoComplete="email"
            />
            <Button
              type="button"
              onClick={handleAddSigner}
              disabled={!name.trim() || !email.trim() || isAddingSigner}
            >
              {isAddingSigner ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add
            </Button>
          </div>

          <div className="space-y-2">
            {signers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                No signers added.
              </div>
            ) : (
              signers.map((signer) => (
                <div
                  key={signer.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{signer.signatory_name}</p>
                      <Badge variant="outline" className={STATUS_STYLES[signer.status]}>
                        {signer.status}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{signer.signatory_email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {signer.signing_url ? (
                      <a
                        href={signer.signing_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                    {signer.status === "PENDING" || signer.status === "STALLED" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveSigner(signer.id)}
                        disabled={isRemovingSigner}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>

          {sentOrSigned.length > 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-400" />
              {sentOrSigned.length} signer{sentOrSigned.length === 1 ? "" : "s"} already sent or completed.
            </div>
          ) : null}
        </div>

        <div className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
            <select
              value={activeSignerEmail}
              onChange={(event) => setSelectedSignerEmail(event.target.value)}
              disabled={pendingSigners.length === 0}
              className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {pendingSigners.length === 0 ? (
                <option value="">No pending signers</option>
              ) : (
                pendingSigners.map((signer) => (
                  <option key={signer.id} value={signer.signatory_email}>
                    {signer.signatory_name}
                  </option>
                ))
              )}
            </select>
            <select
              value={fieldType}
              onChange={(event) => setFieldType(event.target.value as FieldDraft["type"])}
              className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="signature">Signature</option>
              <option value="initials">Initials</option>
              <option value="date">Date</option>
              <option value="text input">Text</option>
              <option value="name">Name</option>
              <option value="email">Email</option>
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={handleAddField}
              disabled={!selectedSigner}
            >
              <Plus className="size-4" />
              Field
            </Button>
          </div>

          <div className="space-y-2">
            {fields.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                Default signature and date fields will be used.
              </div>
            ) : (
              fields.map((field) => (
                <div key={field.id} className="rounded-lg border border-border/50 bg-background/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0 text-xs">
                      <span className="font-medium capitalize">{field.type}</span>
                      <span className="text-muted-foreground"> · {field.signerEmail}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 md:grid-cols-7">
                    {(["page", "x", "y", "w", "h"] as const).map((key) => (
                      <Input
                        key={key}
                        type="number"
                        value={field[key]}
                        min={key === "page" ? 1 : 0}
                        max={key === "page" ? undefined : 100}
                        onChange={(event) => updateField(field.id, { [key]: Number(event.target.value) })}
                        className="h-8 text-xs"
                        aria-label={key === "page" ? "page" : `${key} %`}
                        title={key === "page" ? "page" : `${key} %`}
                      />
                    ))}
                    <Input
                      value={field.label}
                      onChange={(event) => updateField(field.id, { label: event.target.value })}
                      className="col-span-2 h-8 text-xs"
                      aria-label="label"
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <Button
            type="button"
            className="w-full bg-violet-600 text-white hover:bg-violet-700"
            onClick={handleSend}
            disabled={!canSend || isSending}
          >
            {isSending ? <Loader2 className="size-4 animate-spin" /> : <PenTool className="size-4" />}
            Send via OpenSign
          </Button>
          {!hasFile ? (
            <p className="text-xs text-rose-300">Attach a document file before sending.</p>
          ) : pendingSigners.length === 0 ? (
            <p className="text-xs text-muted-foreground">Add at least one pending signer.</p>
          ) : !openSignStatus.configured ? (
            <p className="text-xs text-muted-foreground">Sending unlocks after OpenSign env vars are added.</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
