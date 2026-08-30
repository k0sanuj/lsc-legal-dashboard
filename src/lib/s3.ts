/**
 * File storage for the legal platform, on Google Cloud Storage.
 *
 * The estate is GCP-only, so objects live in the fsp-legal-esign-documents
 * bucket (asia-southeast1, next to the database and Cloud Run). Access goes
 * through GCS's S3-compatible XML interop API with an HMAC key, which keeps
 * the AWS SDK client and, more importantly, works from Vercel where no
 * service-account ADC exists. The exported names keep their historical s3
 * spelling because eight call sites use them; the semantics are unchanged.
 *
 * Env:
 *   GCS_BUCKET_NAME       fsp-legal-esign-documents
 *   GCS_HMAC_ACCESS_ID    HMAC access id for the legal-storage service account
 *   GCS_HMAC_SECRET       HMAC secret for the same key
 *
 * Legacy: file_url values written before 2026-08-30 point at
 * s3.amazonaws.com. That AWS account is retired, so getS3KeyFromUrl returns
 * null for them and callers treat them as plain external URLs.
 */
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const GCS_ENDPOINT = "https://storage.googleapis.com"

function getS3Client() {
  return new S3Client({
    endpoint: GCS_ENDPOINT,
    // GCS's interop layer accepts SigV4 with the auto region.
    region: "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.GCS_HMAC_ACCESS_ID!,
      secretAccessKey: process.env.GCS_HMAC_SECRET!,
    },
  })
}

function getBucketName() {
  return process.env.GCS_BUCKET_NAME!
}

function getPublicUrl(key: string): string {
  return `${GCS_ENDPOINT}/${getBucketName()}/${encodeURI(key)}`
}

export async function uploadToS3(file: File, key: string): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: buffer,
      ContentType: file.type,
    })
  )
  return getPublicUrl(key)
}

export async function uploadBufferToS3(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  )
  return getPublicUrl(key)
}

export async function deleteFromS3(key: string): Promise<void> {
  await getS3Client().send(
    new DeleteObjectCommand({ Bucket: getBucketName(), Key: key })
  )
}

export async function getPresignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: getBucketName(), Key: key })
  return getSignedUrl(getS3Client(), command, { expiresIn: 3600 })
}

export function getS3KeyFromUrl(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl)
    const bucket = getBucketName()

    // Path style on the interop endpoint: storage.googleapis.com/<bucket>/<key>
    if (url.hostname === "storage.googleapis.com") {
      const [urlBucket, ...keyParts] = url.pathname.replace(/^\//, "").split("/")
      if (urlBucket === bucket && keyParts.length > 0) {
        return decodeURIComponent(keyParts.join("/"))
      }
    }

    // Virtual-hosted style: <bucket>.storage.googleapis.com/<key>
    if (url.hostname === `${bucket}.storage.googleapis.com`) {
      return decodeURIComponent(url.pathname.replace(/^\//, ""))
    }

    // Anything else, the retired amazonaws URLs included, is not ours to sign.
    return null
  } catch {
    return null
  }
}

export function getS3Key(
  entity: string,
  category: string,
  filename: string
): string {
  const timestamp = Date.now()
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_")
  return `${entity.toLowerCase()}/${category.toLowerCase()}/${timestamp}-${safe}`
}
