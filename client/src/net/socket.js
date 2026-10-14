
export class GameSocket extends EventTarget {
  #socket = null
  #queue = []
  #retryTimer = null
  #attempt = 0
  #closed = false
  #url

  constructor(
    url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
  ) {
    super()
    this.#url = url
  }

  connect() {
    if (this.#closed || this.#socket) return

    const socket = new WebSocket(this.#url)
    this.#socket = socket

    socket.addEventListener('open', () => {
      if (this.#socket !== socket) return

      this.#attempt = 0
      this.dispatchEvent(new Event('open'))

      while (this.#queue.length > 0 && socket.readyState === WebSocket.OPEN) {
        socket.send(this.#queue.shift())
      }
    })

    socket.addEventListener('message', (event) => {
      this.dispatchEvent(new CustomEvent('message', { detail: event.data }))
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
    const data = JSON.stringify(message)

    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#socket.send(data)
      return
    }

    // Не ставимо застарілі координати в чергу.
    this.#queue = this.#queue.filter((item) => {
      try {
        return JSON.parse(item).type !== 'state'
      } catch {
        return false
      }
    })

    if (this.#queue.length < 100) {
      this.#queue.push(data)
    }

    this.connect()
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
