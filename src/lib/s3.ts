import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })
}

function getBucketName() {
  return process.env.S3_BUCKET_NAME!
}

function getPublicUrl(key: string): string {
  return `https://${getBucketName()}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`
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

    if (url.hostname === `${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com`) {
      return decodeURIComponent(url.pathname.replace(/^\//, ""))
    }

    if (url.hostname === "s3.amazonaws.com") {
      const [urlBucket, ...keyParts] = url.pathname.replace(/^\//, "").split("/")
      if (urlBucket === bucket) {
        return decodeURIComponent(keyParts.join("/"))
      }
    }
  } catch {
    return null
  }

  return null
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
