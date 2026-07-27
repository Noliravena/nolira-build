import { open, stat } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'

import type { GrokPromptAttachment, GrokPromptRequest, JsonValue } from '../../shared/acp'
import { GrokAcpError } from './errors'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_TEXT_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_INLINE_BYTES = 24 * 1024 * 1024
const MAX_TEXT_CHARACTERS = 200_000

export interface BuildPromptBlocksOptions {
  imageSupported?: boolean
}

/** Convert UI attachments into ACP content blocks without exposing renderer file access. */
export async function buildPromptBlocks(
  request: Pick<GrokPromptRequest, 'text' | 'attachments'>,
  options: BuildPromptBlocksOptions = {},
): Promise<JsonValue[]> {
  const blocks: JsonValue[] = []
  const text = request.text.trim()
  if (text) blocks.push({ type: 'text', text })

  const pathNotes: string[] = []
  let inlineBytes = 0
  for (const attachment of request.attachments ?? []) {
    const absolutePath = resolve(attachment.path)
    const metadata = await fileMetadata(absolutePath, attachment)

    if (metadata.mimeType.startsWith('image/')) {
      if (!options.imageSupported) {
        pathNotes.push(`${absolutePath} (${metadata.mimeType}; image input unavailable)`)
        continue
      }

      if (metadata.size > MAX_IMAGE_BYTES) {
        throw new GrokAcpError(
          `Attachment is larger than 8 MB: ${metadata.name}`,
        )
      }
      const bytes = await readFileWithinLimit(absolutePath, MAX_IMAGE_BYTES)
      inlineBytes += bytes.byteLength
      enforceTotalInlineLimit(inlineBytes)
      blocks.push({
        type: 'image',
        mimeType: metadata.mimeType,
        data: bytes.toString('base64'),
      })
      continue
    }

    if (isTextAttachment(absolutePath, metadata.mimeType)) {
      if (metadata.size > MAX_TEXT_BYTES) {
        throw new GrokAcpError(
          `Text attachment is larger than 8 MB: ${metadata.name}`,
        )
      }
      const bytes = await readFileWithinLimit(absolutePath, MAX_TEXT_BYTES)
      inlineBytes += bytes.byteLength
      enforceTotalInlineLimit(inlineBytes)
      const content = bytes.toString('utf8')
      const clipped = content.length > MAX_TEXT_CHARACTERS
        ? `${content.slice(0, MAX_TEXT_CHARACTERS)}\n\n… [truncated, ${content.length} characters total]`
        : content
      blocks.push({
        type: 'text',
        text: `Attached file \`${metadata.name}\` (${absolutePath}):\n\`\`\`\n${clipped}\n\`\`\``,
      })
      continue
    }

    pathNotes.push(`${absolutePath} (${metadata.mimeType})`)
  }

  if (pathNotes.length > 0) {
    blocks.push({
      type: 'text',
      text: `Attached files (open from disk):\n${pathNotes
        .map((path) => `- \`${path}\``)
        .join('\n')}`,
    })
  }

  if (blocks.length === 0) {
    throw new GrokAcpError('A prompt must include text or at least one attachment.')
  }
  return blocks
}

function enforceTotalInlineLimit(bytes: number): void {
  if (bytes > MAX_TOTAL_INLINE_BYTES) {
    throw new GrokAcpError('Inline attachments exceed the 24 MB total limit.')
  }
}

async function readFileWithinLimit(
  path: string,
  limit: number
): Promise<Buffer> {
  const handle = await open(path, 'r')
  const buffer = Buffer.allocUnsafe(limit + 1)
  let offset = 0
  try {
    while (offset < buffer.byteLength) {
      const { bytesRead } = await handle.read(
        buffer,
        offset,
        buffer.byteLength - offset,
        offset
      )
      if (bytesRead === 0) break
      offset += bytesRead
    }
  } finally {
    await handle.close()
  }
  if (offset > limit) {
    throw new GrokAcpError('Attachment changed while reading and exceeds 8 MB.')
  }
  return buffer.subarray(0, offset)
}

async function fileMetadata(path: string, attachment: GrokPromptAttachment) {
  let fileStat
  try {
    fileStat = await stat(path)
  } catch (error) {
    throw new GrokAcpError(`Attachment was not found: ${path}`, { cause: error })
  }
  if (!fileStat.isFile()) throw new GrokAcpError(`Attachment is not a file: ${path}`)

  return {
    name: attachment.name?.trim() || basename(path),
    mimeType: attachment.mimeType?.trim() || inferMimeType(path),
    size: fileStat.size,
  }
}

function inferMimeType(path: string): string {
  const extension = extname(path).toLowerCase()
  return MIME_TYPES[extension] ?? 'application/octet-stream'
}

function isTextAttachment(path: string, mimeType: string): boolean {
  return mimeType.startsWith('text/') || TEXT_EXTENSIONS.has(extname(path).toLowerCase())
}

const TEXT_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.css', '.csv', '.go', '.h', '.hpp', '.html', '.java',
  '.js', '.json', '.jsx', '.md', '.mjs', '.py', '.rs', '.sh', '.sql', '.swift',
  '.toml', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml',
])

const MIME_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.csv': 'text/csv',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.html': 'text/html',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.xml': 'application/xml',
}
