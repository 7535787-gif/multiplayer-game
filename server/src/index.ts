import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { decodePacket, encodeSnapshot } from '../../shared/network-protocol.ts'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import { RoomManager } from './room-manager.ts'
import { loadConfig } from './config.ts'
import { createLogger } from './logger.ts'
import { createMatchLogger } from './match-logger.ts'
import { createTokenBucket } from './rate-limiter.ts'
import { parseClientMessage } from '../../shared/protocol.ts'
import { createReadStream, existsSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { performance as nodePerformance, monitorEventLoopDelay } from 'node:perf_hooks'
import { addBots, tickBots } from './bots.ts'
import type { IncomingMessage } from 'node:http'
import type { RawData } from 'ws'
import type { RoomPlayer } from './room.js'

interface GameWebSocket extends WebSocket {
  protocolFormat?: 'json' | 'binary'
  playerRoomId?: string | null
  ipAddress?: string
  player?: RoomPlayer
  room?: import('./room.ts').Room
  missedPongs?: number
}

interface RssSample {
  elapsedSeconds: number
  rssMB: number
}

interface LogEvent {
  type: string
  [key: string]: unknown
}

interface PlayerConnection extends RoomPlayer { roomId: string | null }
interface MatchLogger { log(event: Record<string, unknown>): Promise<void>; close(): Promise<void> }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}
function rawDataToBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (Array.isArray(data)) return Buffer.concat(data)
  // ws.RawData's remaining union member is ArrayBuffer after Buffer[] and Buffer checks.
  return Buffer.from(data)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const clientDistCandidates = [
  process.env.CLIENT_DIST,
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(__dirname, '../../../client/dist'),
  path.resolve(process.cwd(), 'client/dist'),
].filter((candidate): candidate is string => Boolean(candidate))

const clientDist =
  clientDistCandidates.find((candidate) =>
    existsSync(path.join(candidate, 'index.html')),
  ) ?? path.resolve(process.cwd(), 'client/dist')

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

const config = loadConfig()
const logger = await createLogger(config.logDir, config.logLevel)
const VERSION = process.env.BUILD_VERSION ?? 'development'
const GIT_SHA = process.env.GIT_SHA ?? 'unknown'
let ready = false
const ipConnections = new Map<string, number>()
const rejectedConnections = new Map<string, number>()
let messageCount = 0
let byteCount = 0
let messagesPerSecond = 0
let bytesPerSecond = 0
let lastTrafficSample = Date.now()
function reject(reason: string): void { rejectedConnections.set(reason, (rejectedConnections.get(reason) ?? 0) + 1) }
function clientIp(req: IncomingMessage): string {
  if (config.trustProxy) {
    const forwarded = req.headers['x-forwarded-for']
    if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() || 'unknown'
  }
  return req.socket.remoteAddress ?? 'unknown'
}
const matchLoggers = new Map<string, MatchLogger | Promise<MatchLogger | null>>()

function logEvent(type: string, details: Record<string, unknown> = {}): void {
  logger.log({ type, ...details }).catch((error: unknown) => {
    console.error('Помилка журналювання:', error)
  })
}

function logMatch(roomId: string, event: Record<string, unknown>): void {
  const matchLogger = matchLoggers.get(roomId)

  if (!matchLogger) return

  if (matchLogger instanceof Promise) {
    void matchLogger
      .then((resolvedLogger) => resolvedLogger?.log(event))
      .catch((error: unknown) => {
        console.error(`Помилка журналу кімнати ${roomId}:`, error)
      })
    return
  }

  matchLogger.log(event).catch((error: unknown) => {
    console.error(`Помилка журналу кімнати ${roomId}:`, error)
  })
}


const roomDefinitions = [
  {
    id: 'training',
    name: 'Training Room',
    arena: { width: 1000, height: 700 },
    maxPlayers: Math.min(4, config.maxPlayersPerRoom),
    persistent: true,
  },
  {
    id: 'deep-space',
    name: 'Deep Space',
    arena: { width: 1200, height: 800 },
    maxPlayers: Math.min(16, config.maxPlayersPerRoom),
    persistent: true,
  },
  {
    id: 'asteroid-field',
    name: 'Asteroid Field',
    arena: { width: 800, height: 600 },
    maxPlayers: Math.min(4, config.maxPlayersPerRoom),
    persistent: true,
  },
]


const roomManager = new RoomManager({
  maxRooms: config.maxRooms,

  onRoomCreated(room) {
    const matchLoggerPromise = createMatchLogger(room.id, config.logDir)
      .then((matchLogger) => {
        matchLoggers.set(room.id, matchLogger)
        return matchLogger
      })
      .catch((error: unknown) => {
        console.error(
          `Не вдалося створити журнал кімнати ${room.id}:`,
          error,
        )
        return null
      })

    matchLoggers.set(room.id, matchLoggerPromise)

    room.on('player-joined', (player) => {
      console.log(`${player.name} приєднався до ${room.name}`)

      logEvent('player-joined', {
        roomId: room.id,
        playerId: player.id,
        name: player.name,
      })

      logMatch(room.id, {
        type: 'player-joined',
        playerId: player.id,
        name: player.name,
      })
    })

    room.on('player-left', (player) => {
      console.log(`${player.name} вийшов із ${room.name}`)

      logEvent('player-left', {
        roomId: room.id,
        playerId: player.id,
        name: player.name,
      })

      logMatch(room.id, {
        type: 'player-left',
        playerId: player.id,
        name: player.name,
      })
    })

    room.on('chat-message', (message) => {
      logMatch(room.id, {
        type: 'chat-message',
        playerId: message.playerId,
        name: message.name,
        text: message.text,
      })
    })

    room.on('empty', () => {
      logEvent('room-empty', { roomId: room.id })
      logMatch(room.id, { type: 'room-empty' })

      const currentLogger = matchLoggers.get(room.id)
      matchLoggers.delete(room.id)

      Promise.resolve(currentLogger)
        .then((resolvedLogger) => resolvedLogger?.close())
        .catch((error) => {
          console.error(
            `Не вдалося закрити журнал кімнати ${room.id}:`,
            error,
          )
        })
    })
  },
})

for (const definition of roomDefinitions) {
  roomManager.create(definition)
}

const rssSamples: RssSample[] = []
const tickDurations: number[] = []
const eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 })
eventLoopHistogram.enable()
let eventLoopUtilization = nodePerformance.eventLoopUtilization()
const rssStartedAt = Date.now()

const rssTimer = setInterval(() => {
  const memory = process.memoryUsage()

  rssSamples.push({
    elapsedSeconds: Number(
      ((Date.now() - rssStartedAt) / 1000).toFixed(1),
    ),
    rssMB: Number((memory.rss / 1024 / 1024).toFixed(2)),
  })
}, 500)

const server = createServer(async (req, res) => {
  let pathname: string

  try {
    pathname = new URL(req.url ?? '/', 'http://localhost').pathname
  } catch {
    res.writeHead(400)
    res.end('Bad Request')
    return
  }

  if (req.method === 'GET' && pathname === '/api/slow') {
    const startedAt = Date.now()
    const blockForMs = 300
  
    while (Date.now() - startedAt < blockForMs) {
      // Навмисно блокуємо event loop для демонстрації.
    }
  
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
    })
  
    res.end(
      JSON.stringify({
        message: 'Event loop was intentionally blocked',
        requestedBlockMs: blockForMs,
        actualBlockMs: Date.now() - startedAt,
      }),
    )
  
    return
  }

  if (req.method === 'GET' && pathname === '/metrics') {
    const sorted = [...tickDurations].sort((a, b) => a - b)
    const percentile = (p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0 : 0
    const current = nodePerformance.eventLoopUtilization()
    const elu = nodePerformance.eventLoopUtilization(current, eventLoopUtilization)
    eventLoopUtilization = current
    const players = [...wss.clients].filter((client) => client.readyState === WebSocket.OPEN && client.playerRoomId).length
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ version: VERSION, gitSha: GIT_SHA, players, rooms: roomManager.size, messagesPerSecond, bytesPerSecond, tickSamples: sorted.length, tickP50Ms: percentile(.50), tickP95Ms: percentile(.95), tickP99Ms: percentile(.99), eventLoopUtilization: elu.utilization, eventLoopDelayP99Ms: Number(eventLoopHistogram.percentile(99) / 1e6), rssBytes: process.memoryUsage().rss, rejectedConnections: Object.fromEntries(rejectedConnections) }))
    return
  }

  const botRoute = pathname.match(/^\/api\/rooms\/([a-zA-Z0-9_-]+)\/bots$/)
  if (req.method === 'POST' && botRoute) {
    const room = roomManager.get(botRoute[1] ?? '')
    if (!room) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Room not found' })); return }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => { size += chunk.length; if (size <= 2048) chunks.push(chunk) })
    req.on('end', () => {
      if (size > 2048) { res.writeHead(413); res.end(); return }
      let body: unknown = {}
      try { if (chunks.length) body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })); return }
      const count = isRecord(body) ? body.count : undefined
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 8) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'count must be an integer from 1 to 8' })); return }
      const added = addBots(room, count)
      broadcastRoster(room.id)
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ added: added.length, bots: added.map(({ id, name }) => ({ id, name })), room: room.toJSON() }))
    })
    return
  }

  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ status: 'ok', version: VERSION, gitSha: GIT_SHA, uptimeSeconds: Math.floor(process.uptime()) }))
    return
  }

  if (req.method === 'GET' && pathname === '/ready') {
    res.writeHead(ready && !shuttingDown ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ status: ready && !shuttingDown ? 'ready' : 'not-ready', version: VERSION, gitSha: GIT_SHA }))
    return
  }

  if (req.method === 'GET' && pathname.startsWith('/api/replays/')) {
    const roomId = pathname.slice('/api/replays/'.length)

    if (!/^[a-zA-Z0-9_-]+$/.test(roomId)) {
      res.writeHead(400, {
        'Content-Type': 'application/json; charset=utf-8',
      })
      res.end(JSON.stringify({ error: 'Invalid replay ID' }))
      return
    }

    const replayPath = path.join(
      config.logDir,
      `match-${roomId}.ndjson`,
    )

    try {
      const fileInfo = await stat(replayPath)

      if (!fileInfo.isFile()) {
        res.writeHead(404)
        res.end('Replay not found')
        return
      }

      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Content-Disposition': `attachment; filename="match-${roomId}.ndjson"`,
        'Content-Length': fileInfo.size,
      })

      await pipeline(createReadStream(replayPath), res)
    } catch (error: unknown) {
      const code = getErrorCode(error)
      if (!res.headersSent) {
        res.writeHead(code === 'ENOENT' ? 404 : 500)
        res.end(
          code === 'ENOENT' ? 'Replay not found' : 'Server error',
        )
      } else {
        res.destroy()
      }

      if (
        code !== 'ENOENT' &&
        code !== 'ERR_STREAM_PREMATURE_CLOSE'
      ) {
        console.error('Помилка читання replay:', error)
      }
    }

    return
  }

  if (req.method === 'GET' && pathname === '/api/rooms') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
    })
    res.end(
      JSON.stringify({
        rooms: [...roomManager.values()].map((room) => room.toJSON()),
      }),
    )
    return
  }

  if (req.method === 'POST' && pathname === '/api/rooms') {
    const chunks: Buffer[] = []
    let bodySize = 0
    let tooLarge = false

    req.on('data', (chunk) => {
      bodySize += chunk.length

      if (bodySize > 4096) {
        tooLarge = true
        return
      }

      if (!tooLarge) chunks.push(chunk)
    })

    req.on('end', () => {
      if (tooLarge) {
        res.writeHead(413, {
          'Content-Type': 'application/json; charset=utf-8',
        })
        res.end(JSON.stringify({ error: 'Request body too large' }))
        return
      }

      let body: unknown

      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        res.writeHead(400, {
          'Content-Type': 'application/json; charset=utf-8',
        })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
        return
      }

      if (!isRecord(body) || typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 40) {
        res.writeHead(400, {
          'Content-Type': 'application/json; charset=utf-8',
        })
        res.end(
          JSON.stringify({
            error: 'Room name must contain 2-40 characters',
          }),
        )
        return
      }

      console.log({
        currentRooms: roomManager.size,
        maxRooms: config.maxRooms,
      })

      if (roomManager.size >= config.maxRooms) {
        res.writeHead(409, {
          'Content-Type': 'application/json; charset=utf-8',
        })
        res.end(JSON.stringify({ error: 'Room limit reached' }))
        return
      }

      const maxPlayers: unknown = body.maxPlayers ?? 4

      if (
        typeof maxPlayers !== 'number' || !Number.isInteger(maxPlayers) ||
        maxPlayers < 2 ||
        maxPlayers > config.maxPlayersPerRoom
      ) {
        res.writeHead(400, {
          'Content-Type': 'application/json; charset=utf-8',
        })
        res.end(
          JSON.stringify({
            error: 'maxPlayers must be an integer from 2 to 128',
          }),
        )
        return
      }

      const id = `room-${randomUUID()}`

      const room = roomManager.create({
        id,
        name: body.name.trim(),
        arena: { width: 1000, height: 700 },
        maxPlayers,
      })

      res.writeHead(201, {
        'Content-Type': 'application/json; charset=utf-8',
      })
      res.end(JSON.stringify({ room: room.toJSON() }))
    })

    req.on('error', (error) => {
      logEvent('http-request-error', { message: error.message })

      if (!res.headersSent && !res.destroyed) {
        res.writeHead(400, {
          'Content-Type': 'application/json; charset=utf-8',
        })
        res.end(JSON.stringify({ error: 'Request failed' }))
      }
    })

    return
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    let relativePath

    try {
      relativePath = decodeURIComponent(pathname).replace(/^\/+/, '')
    } catch {
      res.writeHead(400)
      res.end('Invalid URL')
      return
    }

    if (!relativePath || relativePath.endsWith('/')) {
      relativePath += 'index.html'
    }

    const filePath = path.resolve(clientDist, relativePath)
    const relativeToDist = path.relative(clientDist, filePath)

    if (
      relativeToDist === '..' ||
      relativeToDist.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeToDist)
    ) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    try {
      const data = await readFile(filePath)

      res.writeHead(200, {
        'Content-Type':
          mimeTypes[path.extname(filePath).toLowerCase()] ??
          'application/octet-stream',
        'Content-Length': data.length,
      })

      res.end(req.method === 'HEAD' ? undefined : data)
      return
    } catch (error: unknown) {
      const code = getErrorCode(error)
      if (code !== 'ENOENT' && code !== 'EISDIR') {
        logEvent('static-file-error', { message: error instanceof Error ? error.message : String(error) })
        res.writeHead(500)
        res.end('Internal Server Error')
        return
      }
    }
  }

  res.writeHead(404, {
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify({ error: 'Not found' }))
})

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 4096,
})

function broadcastRoster(roomId: string): void {
  const room = roomManager.get(roomId)
  if (!room) return

  const payload = JSON.stringify({
    type: 'roster',
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      x: player.x,
      y: player.y,
      angle: player.angle,
    })),
  })

  for (const client of wss.clients) {
    if (
      client.readyState === WebSocket.OPEN &&
      client.playerRoomId === roomId &&
      client.bufferedAmount < 1024 * 1024
    ) {
      client.send(payload)
    }
  }
}

server.on('upgrade', (req, socket, head) => {
  if (shuttingDown) { socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n'); socket.destroy(); return }
  const origin = req.headers.origin
  if ((!origin && process.env.NODE_ENV === 'production') || (origin && !config.allowedOrigins.includes(origin))) { reject('origin'); logEvent('connection-rejected', { reason: 'origin', origin }); socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return }
  const ip = clientIp(req)
  const currentForIp = ipConnections.get(ip) ?? 0
  if (currentForIp >= config.maxConnectionsPerIp) { reject('ip-limit'); logEvent('connection-rejected', { reason: 'ip-limit', ip }); socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); socket.destroy(); return }
  let pathname: string
  try {
    pathname = new URL(req.url ?? '/', 'http://localhost').pathname
  } catch {
    socket.destroy()
    return
  }
  if (pathname !== '/ws') {
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    ipConnections.set(ip, currentForIp + 1)
    ;(ws as GameWebSocket).ipAddress = ip
    const url = new URL(req.url ?? '/', 'http://localhost')
    ws.protocolFormat = url.searchParams.get('protocol') === 'json' ? 'json' : 'binary'
    wss.emit('connection', ws, req)
  })
})

wss.on('connection', (socketWs) => {
  const ws = socketWs as GameWebSocket
  const player: PlayerConnection & RoomPlayer = {
    id: randomUUID(),
    name: '',
    roomId: null,
    x: 0, y: 0, vx: 0, vy: 0, angle: 0,
    input: { left: false, right: false, thrust: false, brake: false },
    inputQueue: [], lastSeq: -1, inputSeq: -1, ackSeq: -1,
  }

  let joined = false
  const messageBucket = createTokenBucket({ capacity: 120, refillPerSecond: 120 })

  ws.missedPongs = 0


  const joinTimer = setTimeout(() => {
    if (!joined) {
      reject('join-timeout')
      logEvent('join-timeout', { playerId: player.id })
      ws.close(1008, 'Join timeout')
    }
  }, 5000)

  ws.on('pong', () => {
    ws.missedPongs = 0
  })

  ws.on('message', (raw, isBinary) => {
    messageCount++
    byteCount += rawDataToBuffer(raw).byteLength
    if (!messageBucket.consume()) {
      reject('rate-limit')
      logEvent('rate-limit', { playerId: player.id, roomId: player.roomId })
      ws.close(1008, 'Rate limit exceeded')
      return
    }

    const rawBuffer = rawDataToBuffer(raw)
    if (rawBuffer.byteLength > 4096) {
      reject('payload-too-large')
      logEvent('message-too-large', { playerId: player.id, roomId: player.roomId })
      ws.close(1009, 'Message too large')
      return
    }

    let message: unknown

    try {
      message = isBinary ? decodePacket(rawBuffer) : JSON.parse(rawBuffer.toString('utf8'))
    } catch {
      reject('invalid-json')
      logEvent('invalid-json', { playerId: player.id, roomId: player.roomId })
      ws.close(1007, 'Invalid JSON')
      return
    }

    const validation = parseClientMessage(message)
    
    if (!validation.ok) {
      reject('invalid-protocol')
      const reason = `Invalid message: ${validation.error.issues
        .map((issue) => issue.message)
        .join('; ')}`
    
    logEvent('invalid-protocol-message', {
      playerId: player.id,
      type: typeof message === 'object' && message !== null && 'type' in message ? String(message.type) : 'unknown',
      reason,
  })

  ws.close(1008, reason)
  return
}

const clientMessage = validation.value
    if (clientMessage.type === 'join') {
      if (joined) {
        ws.close(1008, 'Already joined')
        return
      }

      const room = roomManager.get(clientMessage.roomId)
      const name = clientMessage.name.trim()

      if (!room) {
        ws.send(
          JSON.stringify({
            type: 'error',
            clientMessage: 'Кімнату не знайдено',
          }),
        )
        return
      }

      player.name = name

      if (!room.join(player)) {
        ws.send(
          JSON.stringify({
            type: 'error',
            clientMessage: 'Кімната заповнена',
          }),
        )
        return
      }

      player.roomId = room.id
      joined = true
      ws.playerRoomId = room.id
      ws.player = player
      ws.room = room
      ws.playerRoomId = room.id

      clearTimeout(joinTimer)

      ws.send(
        JSON.stringify({
          type: 'joined',
          playerId: player.id,
          room: room.toJSON(),
        }),
      )

      broadcastRoster(room.id)

      logEvent('player-connected', {
        playerId: player.id,
        roomId: room.id,
      })

      return
    }

    if (!joined) {
      ws.close(1008, 'Join first')
      return
    }

    if (clientMessage.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', sentAt: clientMessage.sentAt }))
      return
    }

    
if (clientMessage.type === 'fire') {
  const room = player.roomId === null ? undefined : roomManager.get(player.roomId)
  const authoritativePlayer = room?.players.get(player.id)
  if (!authoritativePlayer) return

  const angle = authoritativePlayer.angle
  const payload = JSON.stringify({
    type: 'fire',
    playerId: player.id,
    x: authoritativePlayer.x + Math.cos(angle) * 20,
    y: authoritativePlayer.y + Math.sin(angle) * 20,
    angle,
    homing: clientMessage.homing,
  })

  for (const client of wss.clients) {
    if (
      client.readyState === WebSocket.OPEN &&
      client.playerRoomId === player.roomId &&
      client !== ws &&
      client.bufferedAmount < 1024 * 1024
    ) {
      client.send(payload)
    }
  }

  logEvent('player-fired', {
    playerId: player.id,
    roomId: player.roomId,
    homing: clientMessage.homing,
  })
  return
}

    if (clientMessage.type === 'input') {
      const room = player.roomId === null ? undefined : roomManager.get(player.roomId)
      room?.setInput(player.id, clientMessage)
      return
    }

    if (clientMessage.type === 'chat') {
      const text = clientMessage.text.trim()
      if (!text) return

      const room = player.roomId === null ? undefined : roomManager.get(player.roomId)
      room?.recordChat(player, text)

      const payload = JSON.stringify({
        type: 'chat',
        name: player.name,
        text,
      })

      for (const client of wss.clients) {
        if (
          client.readyState === WebSocket.OPEN &&
          client.playerRoomId === player.roomId &&
          client.bufferedAmount < 1024 * 1024
        ) {
          client.send(payload)
        }
      }

      logEvent('chat-clientMessage', {
        playerId: player.id,
        roomId: player.roomId,
      })
    }
  })

  ws.on('close', () => {
    clearTimeout(joinTimer)
    const ip = ws.ipAddress
    if (ip) { const count = Math.max(0, (ipConnections.get(ip) ?? 1) - 1); if (count === 0) ipConnections.delete(ip); else ipConnections.set(ip, count) }

    if (joined) {
      const roomId = player.roomId

      if (roomId !== null) {
        roomManager.get(roomId)?.leave(player.id)
        broadcastRoster(roomId)
      }
    }

    logEvent('player-disconnected', {
      playerId: player.id,
      roomId: player.roomId,
    })
  })

  ws.on('error', (error) => {
    logEvent('websocket-error', {
      playerId: player.id,
      message: error.message,
    })
  })
})

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.readyState !== WebSocket.OPEN) continue

    ws.missedPongs = (ws.missedPongs || 0) + 1

    if (ws.bufferedAmount > 1024 * 1024) {
      reject('slow-client')
      logEvent('slow-client-disconnected', { playerId: ws.player?.id, roomId: ws.playerRoomId })
      ws.close(1008, 'Slow client')
      continue
    }

    if (ws.missedPongs >= 2) {
      logEvent('heartbeat-timeout', {
        playerId: ws.player?.id,
      })

      ws.terminate()
      continue
    }

    ws.ping()
  }
}, 15000)

let shuttingDown = false
let fatalShutdown = false

async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true

  ready = false
  logEvent('shutdown-started', { signal: 'SIGTERM' })
  console.log('Завершення сервера...')
  clearInterval(heartbeat)
  clearInterval(rssTimer)
  eventLoopHistogram.disable()
  if (simulationTimer !== null) clearTimeout(simulationTimer)

  try {
    const csv = [
      'elapsedSeconds,rssMB',
      ...rssSamples.map(
        (sample) => `${sample.elapsedSeconds},${sample.rssMB}`,
      ),
      '',
    ].join('\n')

    await writeFile(
      path.join(config.logDir, 'rss.csv'),
      csv,
      'utf8',
    )

    console.log(`RSS збережено: ${rssSamples.length} вимірювань`)
  } catch (error) {
    console.error('Не вдалося зберегти RSS:', error)
  }

  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'shutdown', message: 'Сервер перезапускається. Поверніться до лобі.' })) } catch { /* socket may already be closing */ }
      ws.close(1001, 'Server shutting down')
    }
  }

  const forceClose = setTimeout(() => {
    for (const ws of wss.clients) {
      ws.terminate()
    }
  }, 2000)

  forceClose.unref()
  wss.close()

  server.close(async () => {
    clearTimeout(forceClose)

    try {
      const closeTasks = [...matchLoggers.values()].map((matchLogger) =>
        Promise.resolve(matchLogger).then((resolvedLogger) =>
          resolvedLogger?.close(),
        ),
      )

      matchLoggers.clear()

      await Promise.allSettled(closeTasks)
      await logger.flush()
      await logger.close()

      console.log('Журнал збережено. Сервер завершено.')
      process.exitCode = fatalShutdown ? 1 : 0
    } catch (error) {
      console.error('Помилка журналювання:', error)
      process.exitCode = 1
    }
  })
  // Close idle HTTP keep-alive connections too, so shutdown cannot hang.
  server.closeAllConnections?.()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
const fatal = (kind: string, error: unknown) => {
  const details = error instanceof Error ? { message: error.message, stack: error.stack } : { error: String(error) }
  fatalShutdown = true
  process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'fatal', type: kind, ...details })}\n`)
  process.exitCode = 1
  void shutdown().finally(() => { process.exitCode = 1 })
}
process.on('uncaughtException', (error) => fatal('uncaught-exception', error))
process.on('unhandledRejection', (reason) => fatal('unhandled-rejection', reason))
setTimeout(() => { if (shuttingDown) process.exit(1) }, 9000).unref()

server.on('error', (error) => {
  console.error('Помилка HTTP-сервера:', error)
  logEvent('http-server-error', { message: error.message })
})

const SIMULATION_STEP_MS = 1000 / 30
let nextSimulationTime = performance.now() + SIMULATION_STEP_MS
let simulationTimer: ReturnType<typeof setTimeout> | null = null

function runSimulation() {
  if (shuttingDown) return
  const now = performance.now()

  while (now >= nextSimulationTime) {
    const tickStartedAt = performance.now()
    for (const room of roomManager.values()) {
      const botShots = tickBots(room)
      for (const bot of botShots) {
        const payload = JSON.stringify({ type: 'fire', playerId: bot.id, x: bot.x + Math.cos(bot.angle) * 20, y: bot.y + Math.sin(bot.angle) * 20, angle: bot.angle, homing: false })
        for (const client of wss.clients) {
          if (client.readyState === WebSocket.OPEN && client.playerRoomId === room.id && client.bufferedAmount < 1024 * 1024) client.send(payload)
        }
      }
      room.simulateStep()
    }
    tickDurations.push(performance.now() - tickStartedAt)
    if (tickDurations.length > 2000) tickDurations.shift()
    nextSimulationTime += SIMULATION_STEP_MS
  }

  for (const room of roomManager.values()) {
    if (room.players.size === 0) continue

    const snapshot = room.snapshot()

    for (const client of wss.clients) {
      if (
        client.readyState === WebSocket.OPEN &&
        client.playerRoomId === room.id &&
        client.bufferedAmount < 1024 * 1024
      ) {
        if (client.protocolFormat === 'json') {
          client.send(JSON.stringify(snapshot))
        } else {
          client.send(encodeSnapshot(snapshot), { binary: true })
        }
      }
    }
  }

  simulationTimer = setTimeout(
    runSimulation,
    Math.max(0, nextSimulationTime - performance.now())
  )
}

simulationTimer = setTimeout(runSimulation, SIMULATION_STEP_MS)
setInterval(() => {
  const now = Date.now()
  const elapsed = Math.max(0.001, (now - lastTrafficSample) / 1000)
  messagesPerSecond = Number((messageCount / elapsed).toFixed(2))
  bytesPerSecond = Number((byteCount / elapsed).toFixed(2))
  messageCount = 0; byteCount = 0; lastTrafficSample = now
}, 1000).unref()

server.listen(config.port, '0.0.0.0', () => {
  ready = true
  logEvent('server-ready', { port: config.port, version: VERSION })
  console.log(`HTTP server: http://0.0.0.0:${config.port} (${VERSION})`)
})