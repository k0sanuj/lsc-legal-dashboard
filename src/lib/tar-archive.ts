/** Small streaming POSIX tar writer. Paths are supplied safe ASCII IDs, never user filenames. */
import { createReadStream } from "node:fs"
import type { FileHandle } from "node:fs/promises"

export function tarHeader(path: string, size: number, modified: Date): Buffer {
  if (!/^[A-Za-z0-9_./-]+$/.test(path) || path.includes("..") || path.startsWith("/") || Buffer.byteLength(path) > 99) throw new Error("Unsafe archive path")
  if (!Number.isSafeInteger(size) || size < 0 || size > 0o77777777777) throw new Error("Unsupported archive entry size")
  const header = Buffer.alloc(512)
  header.write(path, 0, 100)
  header.write("0000600\0", 100, 8)
  header.write("0000000\0", 108, 8)
  header.write("0000000\0", 116, 8)
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12)
  header.write(`${Math.floor(modified.getTime() / 1000).toString(8).padStart(11, "0")}\0`, 136, 12)
  header.fill(32, 148, 156)
  header[156] = 48
  header.write("ustar\0", 257, 6)
  header.write("00", 263, 2)
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8)
  return header
}

async function writeAll(archive: FileHandle, bytes: Buffer) {
  let offset = 0
  while (offset < bytes.length) {
    const { bytesWritten } = await archive.write(bytes, offset, bytes.length - offset)
    if (!bytesWritten) throw new Error("Archive write made no progress")
    offset += bytesWritten
  }
}

export async function finishTar(archive: FileHandle) {
  await writeAll(archive, Buffer.alloc(1024))
}

export async function appendTarFile(archive: FileHandle, path: string, localPath: string, size: number, at: Date) {
  await writeAll(archive, tarHeader(path, size, at))
  for await (const chunk of createReadStream(localPath)) await writeAll(archive, chunk as Buffer)
  const padding = (512 - (size % 512)) % 512
  if (padding) await writeAll(archive, Buffer.alloc(padding))
}

export async function appendTarText(archive: FileHandle, path: string, content: string, at: Date) {
  const bytes = Buffer.from(content)
  await writeAll(archive, tarHeader(path, bytes.length, at))
  await writeAll(archive, bytes)
  const padding = (512 - (bytes.length % 512)) % 512
  if (padding) await writeAll(archive, Buffer.alloc(padding))
}
