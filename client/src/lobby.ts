
import { z } from 'zod'
import { fetchJson } from './assets/loader.js'

export interface Room {
  id: string
  name: string
  players?: number
  maxPlayers?: number
}

const roomsResponseSchema = z.object({
  rooms: z.array(z.object({
    id: z.string(),
    name: z.string(),
    players: z.number().optional(),
    maxPlayers: z.number().optional(),
  }).strict()),
}).strict()

interface LobbyOptions {
  roomsUrl?: string
  refreshInterval?: number
  requestTimeout?: number
}

export class Lobby extends EventTarget {
  #rooms: Room[] = []
  #visible = false
  #controller: AbortController | null = null
  #refreshTimer: ReturnType<typeof setInterval> | null = null
  #refreshing = false

  readonly roomsUrl: string
  readonly refreshInterval: number
  readonly requestTimeout: number

  constructor({
    roomsUrl = '/api/rooms',
    refreshInterval = 5000,
    requestTimeout = 4000,
  }: LobbyOptions = {}) {
    super()
    this.roomsUrl = roomsUrl
    this.refreshInterval = refreshInterval
    this.requestTimeout = requestTimeout
  }

  get rooms(): Room[] {
    return this.#rooms.map((room) => ({ ...room }))
  }

  get visible(): boolean {
    return this.#visible
  }

  async open(): Promise<void> {
    if (this.#visible) return

    this.#visible = true
    this.#controller = new AbortController()

    await this.refresh()

    if (this.#visible) {
      this.#refreshTimer = setInterval(() => {
        void this.refresh()
      }, this.refreshInterval)
    }
  }

  async refresh(): Promise<void> {
    if (
      !this.#visible ||
      !this.#controller ||
      this.#controller.signal.aborted ||
      this.#refreshing
    ) {
      return
    }

    this.#refreshing = true

    try {
      const signal = AbortSignal.any([
        this.#controller.signal,
        AbortSignal.timeout(this.requestTimeout),
      ])

      const raw: unknown = await fetchJson(this.roomsUrl, { signal })
      const parsed = roomsResponseSchema.safeParse(raw)
      if (!parsed.success) {
        throw new TypeError('Некоректний формат відповіді /api/rooms')
      }
      const data = parsed.data

      if (!this.#visible || signal.aborted) return

      this.#rooms = data.rooms

      this.dispatchEvent(
        new CustomEvent('rooms-updated', {
          detail: { rooms: this.rooms },
        }),
      )
    } catch (error: unknown) {
      if (!this.#visible || this.#controller?.signal.aborted) return

      this.dispatchEvent(
        new CustomEvent('lobby-error', {
          detail: { error, rooms: this.rooms },
        }),
      )
    } finally {
      this.#refreshing = false
    }
  }

  join(playerName: string, roomId: string): void {
    const name = playerName.trim()

    if (!name) {
      throw new Error("Введи ім'я гравця")
    }

    const room = this.#rooms.find((item) => item.id === roomId)

    if (!room) {
      throw new Error('Обрана кімната недоступна')
    }

    this.dispatchEvent(
      new CustomEvent('join', {
        detail: {
          playerName: name,
          room: { ...room },
        },
      }),
    )
  }

  close(): void {
    if (!this.#visible) return

    this.#visible = false

    if (this.#refreshTimer !== null) {
      clearInterval(this.#refreshTimer)
      this.#refreshTimer = null
    }

    this.#controller?.abort()
    this.#controller = null

    this.dispatchEvent(new Event('close'))
  }
}
