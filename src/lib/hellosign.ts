import { SignatureRequestApi, SignatureRequestSendRequest, SubSignatureRequestSigner } from "@dropbox/sign"

function getClient() {
  const api = new SignatureRequestApi()
  api.username = process.env.HELLOSIGN_API_KEY!
  return api
}

export async function sendSignatureRequest(params: {
  title: string
  subject: string
  message: string
  signers: Array<{ name: string; email: string }>
  fileUrl?: string
}) {
  const api = getClient()
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
  request.testMode = process.env.NODE_ENV !== "production"
  request.ccEmailAddresses = ["legal@fsp.co"]

  const result = await api.signatureRequestSend(request)
  return result.body.signatureRequest
}

export async function getSignatureStatus(signatureRequestId: string) {
  const api = getClient()
  const result = await api.signatureRequestGet(signatureRequestId)
  return result.body.signatureRequest
}
