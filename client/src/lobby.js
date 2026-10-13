
import { fetchJson } from './assets/loader.js'

export class Lobby extends EventTarget {
  #rooms = []
  #visible = false
  #controller = null
  #refreshTimer = null
  #refreshing = false

  constructor({
    roomsUrl = '/api/rooms',
    refreshInterval = 5000,
    requestTimeout = 4000,
  } = {}) {
    super()
    this.roomsUrl = roomsUrl
    this.refreshInterval = refreshInterval
    this.requestTimeout = requestTimeout
  }

  get rooms() {
    return this.#rooms.map((room) => ({ ...room }))
  }

  get visible() {
    return this.#visible
  }

  async open() {
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

  async refresh() {
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

      const data = await fetchJson(this.roomsUrl, { signal })

      if (!Array.isArray(data?.rooms)) {
        throw new TypeError('Некоректний формат відповіді /api/rooms')
      }

      if (!this.#visible || signal.aborted) return

      this.#rooms = data.rooms

      this.dispatchEvent(
        new CustomEvent('rooms-updated', {
          detail: { rooms: this.rooms },
        }),
      )
    } catch (error) {
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

  join(playerName, roomId) {
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

  close() {
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
