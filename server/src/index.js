import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import { RoomManager } from './room-manager.js'
import { loadConfig } from './config.js'
import { createLogger } from './logger.js'
import { createMatchLogger } from './match-logger.js'
import { validateMessage } from './protocol.js'
import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const clientDist = path.resolve(__dirname, '../../client/dist')

const mimeTypes = {
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
const logger = await createLogger(config.logDir)
const matchLoggers = new Map()

function logEvent(type, details = {}) {
  logger.log({ type, ...details }).catch((error) => {
    console.error('Помилка журналювання:', error)
  })
}

function logMatch(roomId, event) {
  const matchLogger = matchLoggers.get(roomId)

  if (!matchLogger) return

  if (matchLogger instanceof Promise) {
    matchLogger.then((resolvedLogger) => {
      resolvedLogger?.log(event).catch((error) => {
        console.error(`Помилка журналу кімнати ${roomId}:`, error)
      })
    })
    return
  }

  matchLogger.log(event).catch((error) => {
    console.error(`Помилка журналу кімнати ${roomId}:`, error)
  })
}

const roomDefinitions = [
  {
    id: 'training',
    name: 'Training Room',
    arena: { width: 1000, height: 700 },
    maxPlayers: 4,
  },
  {
    id: 'deep-space',
    name: 'Deep Space',
    arena: { width: 1200, height: 800 },
    maxPlayers: 8,
  },
  {
    id: 'asteroid-field',
    name: 'Asteroid Field',
    arena: { width: 800, height: 600 },
    maxPlayers: 4,
  },
]

const roomManager = new RoomManager({
  maxRooms: 20,

  onRoomCreated(room) {
    const matchLoggerPromise = createMatchLogger(room.id, config.logDir)
      .then((matchLogger) => {
        matchLoggers.set(room.id, matchLogger)
        return matchLogger
      })
      .catch((error) => {
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

const rssSamples = []
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
  let pathname

  try {
    pathname = new URL(req.url, 'http://localhost').pathname
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

  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
    })
    res.end(JSON.stringify({ status: 'ok' }))
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
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(error.code === 'ENOENT' ? 404 : 500)
        res.end(
          error.code === 'ENOENT' ? 'Replay not found' : 'Server error',
        )
      } else {
        res.destroy()
      }

      if (
        error.code !== 'ENOENT' &&
        error.code !== 'ERR_STREAM_PREMATURE_CLOSE'
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
    const chunks = []
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

      let body

      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        res.writeHead(400, {
          'Content-Type': 'application/json; charset=utf-8',
        })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
        return
      }

      if (
        !body ||
        typeof body.name !== 'string' ||
        body.name.trim().length < 2 ||
        body.name.trim().length > 40
      ) {
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

      if (roomManager.size >= 20) {
        res.writeHead(409, {
          'Content-Type': 'application/json; charset=utf-8',
        })
        res.end(JSON.stringify({ error: 'Room limit reached' }))
        return
      }

      const maxPlayers = body.maxPlayers ?? 4

      if (
        !Number.isInteger(maxPlayers) ||
        maxPlayers < 2 ||
        maxPlayers > 8
      ) {
        res.writeHead(400, {
          'Content-Type': 'application/json; charset=utf-8',
        })
        res.end(
          JSON.stringify({
            error: 'maxPlayers must be an integer from 2 to 8',
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
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'EISDIR') {
        logEvent('static-file-error', { message: error.message })
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

function broadcastRoster(roomId) {
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
  if (req.url !== '/ws') {
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

wss.on('connection', (ws) => {
  const player = {
    id: randomUUID(),
    name: '',
    roomId: null,
    x: 0,
    y: 0,
    angle: 0,
  }

  let joined = false
  let messageCount = 0

  ws.missedPongs = 0

  const rateTimer = setInterval(() => {
    messageCount = 0
  }, 1000)

  const joinTimer = setTimeout(() => {
    if (!joined) {
      logEvent('join-timeout', { playerId: player.id })
      ws.close(1008, 'Join timeout')
    }
  }, 5000)

  ws.on('pong', () => {
    ws.missedPongs = 0
  })

  ws.on('message', (raw) => {
    messageCount++

    if (messageCount > 30) {
      logEvent('rate-limit', { playerId: player.id })
      ws.close(1008, 'Rate limit exceeded')
      return
    }

    if (raw.length > 4096) {
      logEvent('message-too-large', { playerId: player.id })
      ws.close(1009, 'Message too large')
      return
    }

    let message

    try {
      message = JSON.parse(raw.toString())
    } catch {
      logEvent('invalid-json', { playerId: player.id })
      ws.close(1007, 'Invalid JSON')
      return
    }

    const validation = validateMessage(message)

    if (!validation.valid) {
      logEvent('invalid-protocol-message', {
        playerId: player.id,
        type: message?.type,
        reason: validation.reason,
      })

      ws.close(validation.code, validation.reason)
      return
    }

    if (message.type === 'join') {
      if (joined) {
        ws.close(1008, 'Already joined')
        return
      }

      const room = roomManager.get(message.roomId)
      const name = message.name.trim()

      if (!room) {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: 'Кімнату не знайдено',
          }),
        )
        return
      }

      player.name = name
      player.roomId = room.id

      if (!room.join(player)) {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: 'Кімната заповнена',
          }),
        )
        return
      }

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

    
if (message.type === 'fire') {
  const payload = JSON.stringify({
    type: 'fire',
    playerId: player.id,
    x: message.x,
    y: message.y,
    angle: message.angle,
    homing: message.homing,
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
    homing: message.homing,
  })

  return
}


    if (message.type === 'state') {
      const room = roomManager.get(player.roomId)

      if (!room || !room.updatePlayer(player.id, message)) {
        return
      }

      const payload = JSON.stringify({
        type: 'state',
        playerId: player.id,
        name: player.name,
        x: player.x,
        y: player.y,
        angle: player.angle,
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

      return
    }

    if (message.type === 'chat') {
      const text = message.text.trim()
      if (!text) return

      const room = roomManager.get(player.roomId)
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

      logEvent('chat-message', {
        playerId: player.id,
        roomId: player.roomId,
      })
    }
  })

  ws.on('close', () => {
    clearTimeout(joinTimer)
    clearInterval(rateTimer)

    if (joined) {
      const roomId = player.roomId

      roomManager.get(roomId)?.leave(player.id)
      broadcastRoster(roomId)
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

async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true

  console.log('Завершення сервера...')
  clearInterval(heartbeat)
  clearInterval(rssTimer)

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
    ws.close(1001, 'Server shutting down')
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
      await logger.close()

      console.log('Журнал збережено. Сервер завершено.')
      process.exitCode = 0
    } catch (error) {
      console.error('Помилка журналювання:', error)
      process.exitCode = 1
    }
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

server.on('error', (error) => {
  console.error('Помилка HTTP-сервера:', error)
  logEvent('http-server-error', { message: error.message })
})

server.listen(config.port, () => {
  console.log(`HTTP server: http://localhost:${config.port}`)
})