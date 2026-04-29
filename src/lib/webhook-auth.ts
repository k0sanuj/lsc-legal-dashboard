export function isAuthorizedSharedSecretRequest(
  request: Request,
  envName: string,
  queryParamName = "token"
): boolean {
  const secret = process.env[envName]
  if (!secret) return false

  const headerSecret = request.headers.get("x-lsc-webhook-secret")
  if (headerSecret === secret) return true

  const url = new URL(request.url)
  return url.searchParams.get(queryParamName) === secret
}
