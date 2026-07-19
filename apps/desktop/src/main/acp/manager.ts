import { EventEmitter } from 'node:events'

import type {
  GrokAcpEvent,
  GrokAcpEventListener,
  GrokCancelRequest,
  GrokConnectRequest,
  GrokPermissionResponse,
  GrokPromptRequest,
  GrokPromptResult,
  GrokSessionReady,
} from '../../shared/acp'
import { GrokAcpClient } from './client'
import { GrokAcpError } from './errors'

interface ManagedClient {
  client: GrokAcpClient
  unsubscribe: () => void
}

/** Keeps one persistent Grok process per task so turns may run concurrently. */
export class GrokAcpManager {
  private readonly emitter = new EventEmitter()
  private readonly clients = new Map<string, ManagedClient>()
  private readonly permissionOwners = new Map<string, string>()

  onEvent(listener: GrokAcpEventListener): () => void {
    this.emitter.on('event', listener)
    return () => this.emitter.off('event', listener)
  }

  async connect(request: GrokConnectRequest): Promise<GrokSessionReady> {
    await this.disconnect(request.taskId)
    const client = new GrokAcpClient(request)
    const unsubscribe = client.onEvent((event) => this.forward(event))
    this.clients.set(request.taskId, { client, unsubscribe })
    try {
      return await client.start()
    } catch (error) {
      this.clients.delete(request.taskId)
      unsubscribe()
      throw error
    }
  }

  async prompt(request: GrokPromptRequest): Promise<GrokPromptResult> {
    return this.requireClient(request.taskId).prompt(request)
  }

  async cancel(request: string | GrokCancelRequest): Promise<void> {
    const taskId = typeof request === 'string' ? request : request.taskId
    await this.requireClient(taskId).cancel()
  }

  async respondPermission(response: GrokPermissionResponse): Promise<void> {
    const taskId = response.taskId ?? this.permissionOwners.get(response.requestId)
    if (!taskId) {
      throw new GrokAcpError(`No task owns permission request: ${response.requestId}`)
    }
    await this.requireClient(taskId).respondPermission(response)
    this.permissionOwners.delete(response.requestId)
  }

  async disconnect(taskId: string): Promise<void> {
    const managed = this.clients.get(taskId)
    if (!managed) return
    this.clients.delete(taskId)
    for (const [requestId, owner] of this.permissionOwners) {
      if (owner === taskId) this.permissionOwners.delete(requestId)
    }
    await managed.client.shutdown()
    managed.unsubscribe()
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.clients.keys()].map((taskId) => this.disconnect(taskId)))
  }

  getClient(taskId: string): GrokAcpClient | undefined {
    return this.clients.get(taskId)?.client
  }

  private requireClient(taskId: string): GrokAcpClient {
    const client = this.clients.get(taskId)?.client
    if (!client) throw new GrokAcpError(`Grok task is not connected: ${taskId}`)
    return client
  }

  private forward(event: GrokAcpEvent): void {
    if (event.type === 'permission-request') {
      this.permissionOwners.set(event.payload.requestId, event.taskId)
    }
    this.emitter.emit('event', event)
  }
}
