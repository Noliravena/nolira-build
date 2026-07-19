import type { JsonValue } from '../../shared/acp'

export type JsonRpcId = number | string

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: JsonRpcId
  method: string
  params?: JsonValue
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: JsonValue
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: JsonRpcId
  result?: JsonValue
  error?: {
    code: number
    message: string
    data?: JsonValue
  }
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse

export function parseJsonRpcLine(line: string): JsonRpcMessage | undefined {
  const trimmed = line.trim()
  if (!trimmed) return undefined

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return undefined
  }

  if (!isRecord(parsed) || parsed.jsonrpc !== '2.0') return undefined
  if ('id' in parsed && !isRpcId(parsed.id)) return undefined
  if ('method' in parsed && typeof parsed.method !== 'string') return undefined
  if (!('method' in parsed) && !('id' in parsed)) return undefined
  return parsed as unknown as JsonRpcMessage
}

export function isJsonRpcResponse(message: JsonRpcMessage): message is JsonRpcResponse {
  return 'id' in message && !('method' in message)
}

export function isJsonRpcRequest(message: JsonRpcMessage): message is JsonRpcRequest {
  return 'id' in message && 'method' in message
}

export function rpcIdKey(id: JsonRpcId): string {
  return `${typeof id}:${id}`
}

function isRpcId(value: unknown): value is JsonRpcId {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
