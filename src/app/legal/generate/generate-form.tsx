'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generateContract, saveGeneratedDocument } from '@/actions/generate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles,
  FileText,
  Building2,
  Variable,
  Loader2,
  Copy,
  Check,
  Save,
} from 'lucide-react'

interface Template {
  id: string
  name: string
  category: string
  variables: { key: string; label: string; placeholder: string }[]
}

interface Entity {
  value: string
  label: string
}

interface GenerateFormProps {
  templates: Template[]
  entities: Entity[]
}

export function GenerateForm({ templates, entities }: GenerateFormProps) {
  const router = useRouter()
  const [templateId, setTemplateId] = useState('')
  const [entity, setEntity] = useState('')
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const [isSaving, startSaveTransition] = useTransition()

  const selectedTemplate = templates.find((t) => t.id === templateId)
  const templateVars = selectedTemplate?.variables ?? []

  function handleVariableChange(key: string, value: string) {
    setVariables((prev) => ({ ...prev, [key]: value }))
  }

  function handleGenerate() {
    if (!templateId || !entity) return
    setError('')
    startTransition(async () => {
      const result = await generateContract(templateId, variables, entity)
      if (result.success) {
        setDraft(result.draft)
      } else {
        setError(result.error ?? 'Generation failed')
      }
    })
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleSave() {
    if (!draft || !entity || !selectedTemplate) return
    startSaveTransition(async () => {
      const title = `${selectedTemplate.name} - ${variables.counterparty || entity} - Draft`
      const result = await saveGeneratedDocument(
        title,
        entity,
        selectedTemplate.category,
        draft,
        variables
      )
      if (result.success) {
        router.push(`/legal/documents/${result.documentId}`)
      }
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Configuration Panel */}
      <div className="space-y-4">
        {/* Template Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4" />
              Template
            </CardTitle>
            <CardDescription>Select a contract template to start</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={templateId} onValueChange={(v) => { setTemplateId(v ?? ''); setVariables({}) }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Entity Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4" />
              Entity
            </CardTitle>
            <CardDescription>Which entity is this contract for?</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={entity} onValueChange={(v) => setEntity(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select entity..." />
              </SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Variables */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Variable className="size-4" />
              Variables
            </CardTitle>
            <CardDescription>Fill in contract-specific values</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {templateVars.length > 0 ? (
              templateVars.map((v) => (
                <div key={v.key} className="space-y-1">
                  <label htmlFor={v.key} className="text-xs font-medium text-muted-foreground">
                    {v.label}
                  </label>
                  <Input
                    id={v.key}
                    placeholder={v.placeholder}
                    value={variables[v.key] ?? ''}
                    onChange={(e) => handleVariableChange(v.key, e.target.value)}
                  />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                {templateId ? 'No variables for this template' : 'Select a template first'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Generate Button */}
        <Button
          className="w-full bg-linear-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700"
          size="lg"
          disabled={!templateId || !entity || isPending}
          onClick={handleGenerate}
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              Generate Draft
            </>
          )}
        </Button>

        {error && (
          <p className="text-sm text-rose-400">{error}</p>
        )}
      </div>

      {/* Preview Panel */}
      <div>
        <Card className="min-h-100">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4" />
                Preview
                {draft && (
                  <Badge variant="secondary" className="bg-violet-500/10 text-violet-400">
                    AI Draft
                  </Badge>
                )}
              </CardTitle>
              {draft && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={handleCopy} title="Copy to clipboard">
                    {copied ? (
                      <Check className="size-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                    title="Save as document"
                  >
                    {isSaving ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Save className="size-3.5" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {draft ? (
              <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-4 font-mono text-xs leading-relaxed">
                {draft}
              </pre>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-linear-to-br from-violet-500/20 to-purple-600/20">
                  <Sparkles className="size-5 text-violet-400" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  No draft generated yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Select a template, entity, and fill in variables, then click Generate
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
