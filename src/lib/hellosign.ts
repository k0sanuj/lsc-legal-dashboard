import {
  SignatureRequestApi,
  SignatureRequestSendRequest,
  SubSignatureRequestSigner,
  SubUnclaimedDraftSigner,
  UnclaimedDraftApi,
  UnclaimedDraftCreateEmbeddedRequest,
} from "@dropbox/sign"

function requireDropboxSignApiKey(): string {
  const apiKey = process.env.HELLOSIGN_API_KEY
  if (!apiKey) {
    throw new Error("HELLOSIGN_API_KEY is required for Dropbox Sign requests")
  }
  return apiKey
}

export function requireDropboxSignClientId(): string {
  const clientId = process.env.HELLOSIGN_CLIENT_ID
  if (!clientId) {
    throw new Error(
      "HELLOSIGN_CLIENT_ID is required for Dropbox Sign Embedded Requesting"
    )
  }
  return clientId
}

export function getDropboxSignTestMode(): boolean {
  return process.env.HELLOSIGN_TEST_MODE?.toLowerCase() !== "false"
}

export function getDropboxSignApiKey(): string {
  return requireDropboxSignApiKey()
}

function getSignatureRequestClient() {
  const api = new SignatureRequestApi()
  api.username = requireDropboxSignApiKey()
  return api
}

function getUnclaimedDraftClient() {
  const api = new UnclaimedDraftApi()
  api.username = requireDropboxSignApiKey()
  return api
}

function getCcEmailAddresses(): string[] {
  const value = process.env.HELLOSIGN_CC_EMAILS ?? "legal@fsp.co"
  return value
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean)
}

export async function sendSignatureRequest(params: {
  title: string
  subject: string
  message: string
  signers: Array<{ name: string; email: string }>
  fileUrl?: string
}) {
  const api = getSignatureRequestClient()
  const request = new SignatureRequestSendRequest()
  request.title = params.title
  request.subject = params.subject
  request.message = params.message
  if (params.fileUrl) {
    request.fileUrls = [params.fileUrl]
  }
  request.signers = params.signers.map((s, i) => {
    const signer = new SubSignatureRequestSigner()
    signer.emailAddress = s.email
    signer.name = s.name
    signer.order = i
    return signer
  })
  request.testMode = getDropboxSignTestMode()
  request.ccEmailAddresses = getCcEmailAddresses()

  const result = await api.signatureRequestSend(request)
  return result.body.signatureRequest
}

export async function createEmbeddedUnclaimedDraft(params: {
  title: string
  subject: string
  message: string
  requesterEmailAddress: string
  signers: Array<{ name: string; email: string }>
  fileUrl: string
  metadata: Record<string, string>
}) {
  const api = getUnclaimedDraftClient()
  const request = new UnclaimedDraftCreateEmbeddedRequest()
  const clientId = requireDropboxSignClientId()

  request.clientId = clientId
  request.requesterEmailAddress = params.requesterEmailAddress
  request.fileUrls = [params.fileUrl]
  request.subject = params.subject
  request.message = params.message
  request.metadata = params.metadata
  request.testMode = getDropboxSignTestMode()
  request.type = UnclaimedDraftCreateEmbeddedRequest.TypeEnum.RequestSignature
  request.allowDecline = true
  request.allowReassign = true
  request.showPreview = true
  request.ccEmailAddresses = getCcEmailAddresses()
  request.signers = params.signers.map((s, i) => {
    const signer = new SubUnclaimedDraftSigner()
    signer.emailAddress = s.email
    signer.name = s.name
    signer.order = i
    return signer
  })

  const result = await api.unclaimedDraftCreateEmbedded(request)
  const draft = result.body.unclaimedDraft
  if (!draft.claimUrl) {
    throw new Error("Dropbox Sign did not return an embedded claim URL")
  }

  return {
    claimUrl: draft.claimUrl,
    clientId,
    expiresAt: draft.expiresAt ?? null,
    signatureRequestId: draft.signatureRequestId ?? null,
    testMode: draft.testMode ?? getDropboxSignTestMode(),
  }
}

export async function downloadSignatureRequestPdf(
  signatureRequestId: string
): Promise<Buffer> {
  const api = getSignatureRequestClient()
  const result = await api.signatureRequestFiles(signatureRequestId, "pdf")
  return result.body
}

export async function getSignatureStatus(signatureRequestId: string) {
  const api = getSignatureRequestClient()
  const result = await api.signatureRequestGet(signatureRequestId)
  return result.body.signatureRequest
}
