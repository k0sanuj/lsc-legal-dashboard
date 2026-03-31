'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { generateContract, refineContract, saveGeneratedDocument, saveAsTemplate } from '@/actions/generate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
  MessageSquare,
  Send,
  BookmarkPlus,
  LinkIcon,
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

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface GenerateFormProps {
  templates: Template[]
  entities: Entity[]
  preselectedTemplateId?: string
}

export function GenerateForm({ templates, entities, preselectedTemplateId }: GenerateFormProps) {
  const router = useRouter()
  const [templateId, setTemplateId] = useState(preselectedTemplateId ?? '')
  const [entity, setEntity] = useState('')
  const [reference, setReference] = useState('')
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const [isSaving, startSaveTransition] = useTransition()
  const [isRefining, startRefineTransition] = useTransition()

  // Chat refinement
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [showChat, setShowChat] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Save as template dialog
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [isSavingTemplate, startSaveTemplateTransition] = useTransition()

  const selectedTemplate = templates.find((t) => t.id === templateId)
  const templateVars = selectedTemplate?.variables ?? []

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  function handleVariableChange(key: string, value: string) {
    setVariables((prev) => ({ ...prev, [key]: value }))
  }

  function handleGenerate() {
    if (!templateId || !entity) return
    setError('')
    setChatMessages([])
    setShowChat(false)
    startTransition(async () => {
      const result = await generateContract(templateId, variables, entity, reference || undefined)
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
      const title = `${selectedTemplate.name} - ${variables.counterparty || variables.name || entity} - Draft`
      const result = await saveGeneratedDocument(
        title,
        entity,
        selectedTemplate.category,
        draft,
        variables,
        reference || undefined
      )
      if (result.success) {
        router.push(`/legal/documents/${result.documentId}`)
      }
    })
  }

  function handleSendChat() {
    if (!chatInput.trim() || !draft) return
    const instruction = chatInput.trim()
    setChatInput('')
    setChatMessages((prev) => [...prev, { role: 'user', content: instruction }])

    startRefineTransition(async () => {
      const result = await refineContract(draft, instruction)
      if (result.success) {
        setDraft(result.draft)
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Done — contract updated.' },
        ])
      } else {
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${result.error}` },
        ])
      }
    })
  }

  function handleSaveAsTemplate() {
    if (!newTemplateName.trim() || !draft || !selectedTemplate) return
    startSaveTemplateTransition(async () => {
      const result = await saveAsTemplate(
        newTemplateName.trim(),
        selectedTemplate.category,
        entity || null,
        draft,
        templateVars.length > 0
          ? templateVars
          : [
              { key: 'name', label: 'Counterparty Name', placeholder: 'e.g. Acme Corp' },
              { key: 'email', label: 'Email', placeholder: 'e.g. contact@acme.com' },
              { key: 'address', label: 'Address', placeholder: 'e.g. Dubai, UAE' },
              { key: 'term_months', label: 'Term (months)', placeholder: 'e.g. 12' },
            ]
      )
      if (result.success) {
        setTemplateDialogOpen(false)
        setNewTemplateName('')
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

        {/* Reference */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="size-4" />
              Reference
            </CardTitle>
            <CardDescription>Internal reference or deal note (optional)</CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="e.g. Deal #1042, Board approval 2026-03-15"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </CardContent>
        </Card>

        {/* Variables — the fields that change per counterparty */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Variable className="size-4" />
              Counterparty Details
            </CardTitle>
            <CardDescription>Fill in the fields that change per document</CardDescription>
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
                {templateId ? 'No variable fields for this template' : 'Select a template first'}
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

      {/* Preview + Chat Panel */}
      <div className="space-y-4">
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
                    onClick={() => setShowChat(!showChat)}
                    title="Refine with AI"
                  >
                    <MessageSquare className="size-3.5" />
                  </Button>

                  {/* Save as Template */}
                  <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
                    <DialogTrigger
                      render={<Button variant="ghost" size="sm" title="Save as template" />}
                    >
                      <BookmarkPlus className="size-3.5" />
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Save as Template</DialogTitle>
                        <DialogDescription>
                          Save this contract as a reusable template. Future users will only fill in the variable fields.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3 pt-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Template Name</label>
                          <Input
                            placeholder="e.g. Sponsorship Agreement v2"
                            value={newTemplateName}
                            onChange={(e) => setNewTemplateName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Variable Fields</label>
                          <p className="text-xs text-muted-foreground">
                            {templateVars.length > 0
                              ? templateVars.map((v) => v.label).join(', ')
                              : 'Name, Email, Address, Term'}
                          </p>
                        </div>
                        <Button
                          className="w-full"
                          disabled={!newTemplateName.trim() || isSavingTemplate}
                          onClick={handleSaveAsTemplate}
                        >
                          {isSavingTemplate ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <>
                              <BookmarkPlus className="size-4" />
                              Save Template
                            </>
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

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
              <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-4 font-mono text-xs leading-relaxed max-h-[600px] overflow-y-auto">
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
                  Select a template, entity, and fill in the counterparty details, then click Generate
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Chat Refinement */}
        {showChat && draft && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <MessageSquare className="size-4 text-violet-400" />
                Refine with AI
              </CardTitle>
              <CardDescription>
                Give instructions to modify the contract — e.g. &quot;add a non-compete clause&quot; or &quot;change payment terms to NET 60&quot;
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Chat history */}
              {chatMessages.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-2 rounded-lg bg-muted/30 p-3">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`text-xs ${
                        msg.role === 'user'
                          ? 'text-blue-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      <span className="font-medium">
                        {msg.role === 'user' ? 'You: ' : 'AI: '}
                      </span>
                      {msg.content}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}

              {/* Input */}
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Add a non-compete clause for 12 months..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendChat()
                    }
                  }}
                  disabled={isRefining}
                />
                <Button
                  size="sm"
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || isRefining}
                >
                  {isRefining ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
