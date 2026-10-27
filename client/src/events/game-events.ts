import type { ServerMessage } from '../../../shared/protocol.js'

export interface GameEvents {
  message: ServerMessage
  open: undefined
  close: undefined
  'socket-error': undefined
  'protocol-error': Error
}

/** Typed event bus: event names determine the payload type at compile time. */
export class Bus<Events extends Record<string, unknown>> {
  readonly #listeners = new Map<keyof Events, Set<(payload: unknown) => void>>()

  on<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): () => void {
    let listeners = this.#listeners.get(event)
    if (!listeners) {
      listeners = new Set()
      this.#listeners.set(event, listeners)
    }

    // The map erases the event-specific generic; this wrapper restores the type at the API boundary.
    const wrapped = (payload: unknown): void => listener(payload as Events[K])
    listeners.add(wrapped)
    return () => {
      listeners?.delete(wrapped)
      if (listeners?.size === 0) this.#listeners.delete(event)
    }
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const listener of this.#listeners.get(event) ?? []) listener(payload)
  }

  clear(): void {
    this.#listeners.clear()
  }
}
