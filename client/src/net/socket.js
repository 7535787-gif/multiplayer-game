import { decodePacket, encodeInput } from '../../../shared/network-protocol.js'

function readNetworkOptions() {
  const params = new URLSearchParams(location.search)
  const protocol = params.get('protocol') === 'json' ? 'json' : 'binary'
  const delay = Math.max(0, Math.min(2000, Number(params.get('delay')) || 0))
  const jitter = Math.max(0, Math.min(1000, Number(params.get('jitter')) || 0))
  const loss = Math.max(0, Math.min(0.9, Number(params.get('loss')) || 0))
  const interpolationValue = params.has('interp') ? Number(params.get('interp')) : 100
  const interpolationMs = Math.max(0, Math.min(500, Number.isFinite(interpolationValue) ? interpolationValue : 100))
  const prediction = params.get('prediction') !== 'off'
  return { protocol, delay, jitter, loss, interpolationMs, prediction }
}

export class GameSocket extends EventTarget {
  #socket = null
  #queue = []
  #retryTimer = null
  #attempt = 0
  #closed = false
  #url
  #stats = { sentBytes: 0, receivedBytes: 0, droppedPackets: 0, lastRttMs: null }
  #network = readNetworkOptions()

  constructor(url) {
    super()
    const base = url ?? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`
    const parsed = new URL(base)
    parsed.searchParams.set('protocol', this.#network.protocol)
    this.#url = parsed.toString()
  }

  get networkOptions() {
    return { ...this.#network }
  }

  get stats() {
    return { ...this.#stats }
  }

  connect() {
    if (this.#closed || this.#socket) return

    const socket = new WebSocket(this.#url)
    socket.binaryType = 'arraybuffer'
    this.#socket = socket

    socket.addEventListener('open', () => {
      if (this.#socket !== socket) return
      this.#attempt = 0
      this.dispatchEvent(new Event('open'))
      while (this.#queue.length > 0 && socket.readyState === WebSocket.OPEN) {
        const queued = this.#queue.shift()
        this.#transmit(socket, queued.message, queued.bypassSimulation)
      }
    })

    socket.addEventListener('message', (event) => {
      const byteLength = typeof event.data === 'string'
        ? new TextEncoder().encode(event.data).byteLength
        : event.data?.byteLength ?? 0
      this.#stats.receivedBytes += byteLength

      let message
      try {
        message = typeof event.data === 'string'
          ? JSON.parse(event.data)
          : decodePacket(event.data)
      } catch (error) {
        this.dispatchEvent(new CustomEvent('protocol-error', { detail: error }))
        return
      }

      const isSnapshot = message.type === 'snapshot'
      const isNetworkPacket = isSnapshot || message.type === 'pong'
      if (isNetworkPacket && this.#shouldDrop()) {
        this.#stats.droppedPackets++
        return
      }

      const delay = isNetworkPacket ? Math.max(0, this.#network.delay + this.#randomJitter()) : 0
      const deliver = () => {
        if (message.type === 'pong' && Number.isFinite(message.sentAt)) {
          this.#stats.lastRttMs = Math.max(0, performance.now() - message.sentAt)
        }
        if (isSnapshot) message.receivedAt = performance.now()
        this.dispatchEvent(new CustomEvent('message', {
          detail: JSON.stringify(message),
        }))
      }
      if (delay > 0) setTimeout(deliver, delay)
      else deliver()
    })

    socket.addEventListener('error', () => {
      this.dispatchEvent(new Event('socket-error'))
    })

    socket.addEventListener('close', () => {
      if (this.#socket === socket) this.#socket = null
      this.dispatchEvent(new Event('close'))
      if (!this.#closed) this.#scheduleReconnect()
    })
  }

  send(message) {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#transmit(this.#socket, message)
      return
    }

    // Do not replay stale gameplay packets after a reconnect.
    if (['input', 'ping', 'fire'].includes(message.type)) {
      this.connect()
      return
    }
    if (this.#queue.length < 100) this.#queue.push({ message, bypassSimulation: false })
    this.connect()
  }

  #transmit(socket, message, bypassSimulation = false) {
    const isInput = message.type === 'input'
    const isNetworkPacket = isInput || message.type === 'ping'
    if (isNetworkPacket && !bypassSimulation && this.#shouldDrop()) {
      this.#stats.droppedPackets++
      return
    }
    const delay = isNetworkPacket && !bypassSimulation
      ? Math.max(0, this.#network.delay + this.#randomJitter())
      : 0
    const transmitNow = () => {
      if (socket.readyState !== WebSocket.OPEN) return
      let payload
      if (isInput && this.#network.protocol === 'binary') {
        payload = encodeInput(message)
      } else {
        payload = JSON.stringify(message)
      }
      this.#stats.sentBytes += typeof payload === 'string'
        ? new TextEncoder().encode(payload).byteLength
        : payload.byteLength
      socket.send(payload)
    }
    if (delay > 0) setTimeout(transmitNow, delay)
    else transmitNow()
  }

  #randomJitter() {
    return this.#network.jitter > 0
      ? Math.round((Math.random() * 2 - 1) * this.#network.jitter)
      : 0
  }

  #shouldDrop() {
    return this.#network.loss > 0 && Math.random() < this.#network.loss
  }

  #scheduleReconnect() {
    if (this.#retryTimer || this.#closed) return
    const delay = Math.min(1000 * 2 ** this.#attempt, 15000)
    this.#attempt++
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null
      this.connect()
    }, delay)
  }

  close() {
    this.#closed = true
    clearTimeout(this.#retryTimer)
    this.#retryTimer = null
    this.#queue = []
    this.#socket?.close(1000, 'Client closed')
    this.#socket = null
  }
}
