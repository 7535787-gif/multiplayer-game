
import './style.css'

import { createLoop } from './loop.js'
import { createInput } from './input.js'
import { integrateShip, FIXED_DT } from '../../shared/ship-sim.js'
import { reconcileShipState } from '../../shared/reconciliation.js'
import { interpolateRemotePlayer } from '../../shared/interpolation.js'

import { loadJson, loadAll } from './assets/loader.js'

import { Ship } from './sim/ship.js'
import { World } from './sim/world.js'
import { Asteroid } from './sim/asteroid.js'
import { Pickup } from './sim/pickup.js'
import { createHealing } from './sim/healing.js'
import { wrapPosition } from './sim/arena.js'
import { createAudioPlayer } from './audio.js'
import { Lobby } from './lobby.js'
import { LobbyUI } from './lobby-ui.js'
import { GameSocket } from './net/socket.js'
import { Bullet } from './sim/bullet.js'
import { Vector2 } from './sim/vector.js'

import { createCanvas } from './render/canvas.js'

import {
  drawBackground,
  drawShip,
  drawBullet,
  drawAsteroid,
  drawExplosion,
  drawPickup,
} from './render/draw.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <section class="loading-screen" id="loadingScreen">
    <button
      class="loading-button"
      id="startLoading"
      type="button"
    >
      Завантажити ресурси
    </button>
  </section>

  <div class="game-ui" id="gameUi" hidden>
    <section class="hud-panel">
      <header class="hud-heading">
        <div class="hud-logo">✦</div>

        <div>
          <h1 class="hud-title">ПОВІТРЯНИЙ БІЙ // СИМУЛЯЦІЯ</h1>
          <p class="hud-subtitle">
            <span class="status-indicator"></span>
            SYSTEM ONLINE · TRAINING MODE
          </p>
        </div>
      </header>

      <div class="metrics-grid">
        <div class="metric metric--accent">
          <span class="metric-label">РАХУНОК</span>
          <strong class="metric-value" id="score">0</strong>
        </div>

        <div class="metric">
          <span class="metric-label">КРОКИ</span>
          <strong class="metric-value" id="steps">0</strong>
        </div>

        <div class="metric metric--cyan">
          <span class="metric-label">STEPS / S</span>
          <strong class="metric-value" id="stepsPerSecond">0</strong>
        </div>

        <div class="metric metric--cyan">
          <span class="metric-label">FRAMES / S</span>
          <strong class="metric-value" id="framesPerSecond">0</strong>
        </div>

        <div class="metric">
          <span class="metric-label">FRAME TIME</span>
          <strong class="metric-value">
            <span id="frameTime">0</span> ms
          </strong>
        </div>

        <div class="metric">
          <span class="metric-label">ШВИДКІСТЬ</span>
          <strong class="metric-value" id="speed">0</strong>
        </div>

        <div class="metric">
          <span class="metric-label">POSITION X</span>
          <strong class="metric-value" id="x">0</strong>
        </div>

        <div class="metric">
          <span class="metric-label">POSITION Y</span>
          <strong class="metric-value" id="y">0</strong>
        </div>

        <div class="metric">
          <span class="metric-label">КУТ</span>
          <strong class="metric-value" id="angle">0</strong>
        </div>
      </div>
    </section>

    <section class="controls-panel" id="rosterPanel">
      <h2 class="controls-title">PLAYERS / УЧАСНИКИ</h2>
      <ul class="controls-list" id="rosterList">
        <li class="control-item">Очікування гравців...</li>
      </ul>
    </section>

    <section class="chat-panel" id="chatPanel" aria-label="Ігровий чат">
      <h2 class="controls-title">ROOM CHAT / ЧАТ КІМНАТИ</h2>

      <div class="chat-messages" id="chatMessages" aria-live="polite">
        <p class="chat-empty">Повідомлень поки немає</p>
      </div>

      <form class="chat-form" id="chatForm">
        <input
          class="chat-input"
          id="chatInput"
          maxlength="500"
          autocomplete="off"
          placeholder="Напиши повідомлення..."
          aria-label="Повідомлення"
        />
        <button class="chat-send" type="submit">Надіслати</button>
      </form>
    </section>

    <section class="controls-panel">
      <h2 class="controls-title">FLIGHT CONTROLS / КЕРУВАННЯ</h2>

      <ul class="controls-list">
        <li class="control-item">
          <kbd>↑</kbd><span>Тяга</span>
        </li>
        <li class="control-item">
          <kbd>↓</kbd><span>Гальмування / назад</span>
        </li>
        <li class="control-item">
          <kbd>←</kbd><kbd>→</kbd><span>Поворот</span>
        </li>
        <li class="control-item">
          <kbd>Space</kbd><span>Постріл</span>
        </li>
        <li class="control-item">
          <kbd>H</kbd><span>Самонавідна ракета</span>
        </li>
      </ul>
    </section>

    <section class="health-panel">
      <div class="health-top">
        <span class="health-label">HULL INTEGRITY / HP</span>
        <strong class="health-value">
          <span id="hp">100</span><span> / 100</span>
        </strong>
      </div>

      <div
        class="health-track"
        id="hpProgress"
        role="progressbar"
        aria-label="Здоров'я корабля"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="100"
      >
        <div class="health-fill" id="hpBar"></div>
      </div>
    </section>
  </div>
`

const input = createInput()

let inputSequence = 0
const pendingInputs = []
let lastCorrectionMagnitude = 0
let correctionOffset = { x: 0, y: 0 }
const gameCanvas = createCanvas()

app.appendChild(gameCanvas.canvas)
const lobby = new Lobby()
const lobbyUI = new LobbyUI(app)

const { ctx } = gameCanvas

const startButton = document.querySelector('#startLoading')
const loadingScreen = document.querySelector('#loadingScreen')
const gameUi = document.querySelector('#gameUi')

let audioContext = null
let assets = null
let world = null
let ship = null
let destroyAudioPlayer = null

let respawnTimer = 0
let asteroidSpawnTimer = 0
let pickupSpawnTimer = 0

let gameStarted = false

let activeArena = {
  width: 1000,
  height: 700,
  name: 'Deep Space',
}

let activePlayerName = ''
let activeRoomId = ''
let ownPlayerId = null
const remotePlayers = new Map()
let positionSendTimer = 0
let pingTimer = 0
let lastSnapshotReceivedAt = 0
let networkStatsAt = performance.now()
let previousSentBytes = 0
let previousReceivedBytes = 0
let sentBytesPerSecond = 0
let receivedBytesPerSecond = 0
let lastSnapshotTick = -1

// Отримали список кімнат.
lobby.addEventListener('rooms-updated', (event) => {
  lobbyUI.setRooms(event.detail.rooms)
})

// Помилка завантаження кімнат.
lobby.addEventListener('lobby-error', (event) => {
  const message =
    event.detail.error?.message || 'Невідома помилка'

  lobbyUI.setStatus(
    `Не вдалося завантажити кімнати: ${message}. Повторюємо запит автоматично.`,
    'error'
  )
})

const gameSocket = new GameSocket()
let reconnectJoinRequired = false

gameSocket.addEventListener('close', () => {
  if (ownPlayerId && activeRoomId && activePlayerName) reconnectJoinRequired = true
})

gameSocket.addEventListener('open', () => {
  if (!reconnectJoinRequired || !activeRoomId || !activePlayerName) return
  reconnectJoinRequired = false
  gameSocket.send({ type: 'join', name: activePlayerName, roomId: activeRoomId })
})

gameSocket.addEventListener('message', (event) => {
  let message

  try {
    message = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail
  } catch {
    lobbyUI.setBusy(false)
    lobbyUI.setStatus('Сервер надіслав некоректне повідомлення', 'error')
    return
  }

  if (message.type === 'pong') return

  if (message.type === 'roster') {
    const players = Array.isArray(message.players) ? message.players : []
    const rosterList = document.querySelector('#rosterList')
    rosterList.replaceChildren()

    const activeIds = new Set()
    for (const player of players) {
      activeIds.add(player.id)
      const item = document.createElement('li')
      item.className = 'control-item'
      item.textContent = player.id === ownPlayerId
        ? `${player.name} (це ти)`
        : player.name
      rosterList.appendChild(item)

      if (player.id !== ownPlayerId && !remotePlayers.has(player.id)) {
        remotePlayers.set(player.id, {
          id: player.id,
          name: player.name,
          samples: [],
        })
      }
    }

    for (const id of remotePlayers.keys()) {
      if (!activeIds.has(id)) remotePlayers.delete(id)
    }

    if (players.length === 0) {
      const item = document.createElement('li')
      item.className = 'control-item'
      item.textContent = 'Очікування гравців...'
      rosterList.appendChild(item)
    }
    return
  }

  if (message.type === 'snapshot') {
    if (!Array.isArray(message.players)) return

    if (Number.isInteger(message.tick) && message.tick <= lastSnapshotTick) return
    lastSnapshotTick = Number.isInteger(message.tick) ? message.tick : lastSnapshotTick
    lastSnapshotReceivedAt = Number.isFinite(message.receivedAt)
      ? message.receivedAt
      : performance.now()

    const snapshotPlayerIds = new Set(
      message.players.map((player) => player?.id).filter(Boolean),
    )
    for (const id of remotePlayers.keys()) {
      if (!snapshotPlayerIds.has(id)) remotePlayers.delete(id)
    }

    for (const player of message.players) {
      if (!player.id) continue

      if (player.id === ownPlayerId && ship) {
        const before = { x: ship.pos.x, y: ship.pos.y }
        const acknowledged = Number.isInteger(player.ackSeq) ? player.ackSeq : -1
        let predicted = {
          x: player.x, y: player.y, vx: player.vx, vy: player.vy, angle: player.angle,
        }

        if (gameSocket.networkOptions.prediction) {
          const reconciliation = reconcileShipState({
            authoritativeState: predicted,
            pendingInputs,
            acknowledgedSeq: acknowledged,
            currentState: before,
            arena: activeArena,
            dt: FIXED_DT,
          })
          pendingInputs.splice(0, pendingInputs.length, ...reconciliation.pendingInputs)
          predicted = reconciliation.state
          lastCorrectionMagnitude = reconciliation.correctionMagnitude
          // Keep the displayed ship continuous, then decay the offset over ~100 ms.
          correctionOffset.x = reconciliation.correctionOffset.x + correctionOffset.x
          correctionOffset.y = reconciliation.correctionOffset.y + correctionOffset.y
        } else {
          while (pendingInputs.length > 0 && pendingInputs[0].seq <= acknowledged) {
            pendingInputs.shift()
          }
          lastCorrectionMagnitude = Math.hypot(predicted.x - before.x, predicted.y - before.y)
          correctionOffset.x = 0
          correctionOffset.y = 0
        }

        ship.previousPosition = new Vector2(predicted.x, predicted.y)
        ship.pos.x = predicted.x
        ship.pos.y = predicted.y
        ship.angle = predicted.angle
        ship.vel.x = predicted.vx
        ship.vel.y = predicted.vy
      } else {
        let remote = remotePlayers.get(player.id)
        if (!remote) {
          remote = { id: player.id, name: player.name || 'Гравець', samples: [] }
          remotePlayers.set(player.id, remote)
        }
        remote.name = player.name || remote.name || 'Гравець'
        remote.samples.push({
          x: player.x, y: player.y, angle: player.angle,
          receivedAt: lastSnapshotReceivedAt,
        })
        if (remote.samples.length > 12) remote.samples.splice(0, remote.samples.length - 12)
      }
    }

    return
  }

if (message.type === 'fire') {
  if (
    message.playerId !== ownPlayerId &&
    Number.isFinite(message.x) &&
    Number.isFinite(message.y) &&
    Number.isFinite(message.angle) &&
    typeof message.homing === 'boolean'
  ) {
    const bullet = new Bullet(
      new Vector2(message.x, message.y),
      message.angle,
      new Vector2(0, 0),
      null,
      message.playerId
    )

    world.spawn(bullet)
  }

  return
}


  if (message.type === 'chat') {
    appendChatMessage(message.name, message.text)
    return
  }

  
  if (message.type === 'joined') {
    ownPlayerId = message.playerId
    lobbyUI.setBusy(false)

    // Reconnection restores the server-side player without starting a second game loop.
    if (gameStarted) {
      remotePlayers.clear()
      pendingInputs.length = 0
      inputSequence = 0
      correctionOffset = { x: 0, y: 0 }
      lastCorrectionMagnitude = 0
      lastSnapshotTick = -1
      return
    }

    const room = lobby.rooms.find(
      (item) => item.id === activeRoomId
    )

    if (!room) {
      lobbyUI.setStatus(
        'Не вдалося знайти вибрану кімнату.',
        'error'
      )
      return
    }

    lobby.join(activePlayerName, activeRoomId)
    return
  }


  if (message.type === 'error') {
    lobbyUI.setBusy(false)
    lobbyUI.setStatus(message.message, 'error')
  }
})

// Гравець натиснув кнопку приєднання.
lobbyUI.addEventListener('join-request', (event) => {
  const { playerName, roomId } = event.detail

  lobbyUI.setBusy(true)
  activePlayerName = playerName
  activeRoomId = roomId

  gameSocket.send({
    type: 'join',
    name: playerName,
    roomId,
  })
})

document.querySelector('#chatForm').addEventListener('submit', (event) => {
  event.preventDefault()
  const chatInput = document.querySelector('#chatInput')
  const text = chatInput.value.trim()
  if (!text || !ownPlayerId) return

  gameSocket.send({ type: 'chat', text })
  chatInput.value = ''
  chatInput.focus()
})

// Гравець приєднався до вибраної кімнати.
lobby.addEventListener('join', (event) => {
  const { playerName, room } = event.detail

  activePlayerName = playerName

  lobby.close()
  lobbyUI.hide()

  // Підключаємо звуки лише перед запуском гри.
  destroyAudioPlayer?.()

  destroyAudioPlayer = createAudioPlayer(
    audioContext,
    assets.sounds
  )

  remotePlayers.clear()
  pendingInputs.length = 0
  inputSequence = 0
  correctionOffset = { x: 0, y: 0 }
  lastCorrectionMagnitude = 0
  positionSendTimer = 0
  pingTimer = 0
  lastSnapshotReceivedAt = 0
  lastSnapshotTick = -1
  initializeGame(room)

  gameStarted = true
  loadingScreen.hidden = true
  gameUi.hidden = false

  window.addEventListener('keydown', handleKeyDown)

  console.info('Гравець приєднався до кімнати', {
    playerName: activePlayerName,
    room: room.name,
    arena: room.arena,
  })

  createLoop(update, render)
})

// Малюємо екран завантаження безпосередньо на Canvas.
function drawLoadingScreen(progress, status) {
  const width = gameCanvas.width
  const height = gameCanvas.height

  ctx.clearRect(0, 0, width, height)
  drawBackground(ctx, width, height)

  ctx.save()
  ctx.textAlign = 'center'

  const centerX = width / 2
  const centerY = height / 2

  ctx.fillStyle = '#c6d3df'
  ctx.font = '12px "Segoe UI", sans-serif'
  ctx.fillText(
    'ГЛИБОКИЙ КОСМОС / СИСТЕМА ПОЛЬОТУ',
    centerX,
    centerY - 72
  )

  ctx.fillStyle = '#f0f4f7'
  ctx.font = '700 31px "Segoe UI", sans-serif'
  ctx.fillText(
    'ПІДГОТОВКА ДО ПОЛЬОТУ',
    centerX,
    centerY - 35
  )

  ctx.fillStyle = '#a8b7c6'
  ctx.font = '13px "Segoe UI", sans-serif'
  ctx.fillText(
    'Завантаження ігрових ресурсів',
    centerX,
    centerY - 5
  )

  const barWidth = Math.min(440, width - 48)
  const barHeight = 8
  const barX = centerX - barWidth / 2
  const barY = centerY + 24

  // Фон прогрес-бару.
  ctx.fillStyle = 'rgba(159, 180, 201, 0.18)'
  ctx.beginPath()
  ctx.roundRect(barX, barY, barWidth, barHeight, 4)
  ctx.fill()

  // Реальний прогрес завантаження, отриманий із loadAll().
  const safeProgress = Math.max(0, Math.min(1, progress))
  const fillWidth = barWidth * safeProgress

  if (fillWidth > 0) {
    ctx.fillStyle = '#a7c5cd'
    ctx.beginPath()
    ctx.roundRect(barX, barY, fillWidth, barHeight, 4)
    ctx.fill()
  }

  ctx.fillStyle = '#e0e9f0'
  ctx.font = '600 12px "Segoe UI", sans-serif'
  ctx.fillText(
    `${Math.round(safeProgress * 100)}%`,
    centerX,
    barY + 29
  )

  ctx.fillStyle = '#93a5b8'
  ctx.font = '12px "Segoe UI", sans-serif'

  // Не дозволяємо занадто довгому повідомленню виходити за екран.
  const shortStatus =
    status.length > 80 ? `${status.slice(0, 77)}...` : status

  ctx.fillText(
    shortStatus,
    centerX,
    barY + 55
  )

  ctx.restore()
}

function initializeGame(room = null) {
  const roomArena = room?.arena ?? assets.arena

  activeArena = {
    width: Number(roomArena?.width) || gameCanvas.width,
    height: Number(roomArena?.height) || gameCanvas.height,
    name: room?.name || assets.arena?.name || 'Deep Space',
  }

  world = new World()
  world.arena = { ...activeArena }
  world.roomId = room?.id ?? 'default'

  ship = new Ship(
    activeArena.width / 2,
    activeArena.height / 2
  )

  world.spawn(ship)

  world.spawn(
    new Asteroid(
      activeArena.width * 0.2,
      activeArena.height * 0.23,
      22
    )
  )

  world.spawn(
    new Asteroid(
      activeArena.width * 0.76,
      activeArena.height * 0.27,
      27
    )
  )

  world.spawn(
    new Asteroid(
      activeArena.width * 0.25,
      activeArena.height * 0.76,
      19
    )
  )

  world.spawn(
    new Pickup(
      activeArena.width * 0.52,
      activeArena.height * 0.23,
      createHealing(25)
    )
  )
}

function findSafeSpawnPosition() {
  const margin = 50

  for (let attempt = 0; attempt < 50; attempt++) {
    const x =
      margin +
      Math.random() * Math.max(0, activeArena.width - margin * 2)

    const y =
      margin +
      Math.random() * Math.max(0, activeArena.height - margin * 2)

    let safe = true

    for (const asteroid of world.ofKind('asteroid')) {
      const dx = x - asteroid.pos.x
      const dy = y - asteroid.pos.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < asteroid.radius + 65) {
        safe = false
        break
      }
    }

    if (safe) {
      return { x, y }
    }
  }

  return {
    x: activeArena.width / 2,
    y: activeArena.height / 2,
  }
}

function updateCorrectionSmoothing(dt) {
  const decay = Math.exp(-dt / 0.1)
  correctionOffset.x *= decay
  correctionOffset.y *= decay
}
function update(dt) {
  updateCorrectionSmoothing(dt)
  // The local world advances effects, asteroids and bullets. Ship prediction
  // uses the same shared fixed 30 Hz step as the authoritative server.
  world.step(dt, input, { skipEntityId: ship?.id })

  positionSendTimer += dt
  while (positionSendTimer >= FIXED_DT && ownPlayerId && ship) {
    positionSendTimer -= FIXED_DT
    const inputState = {
      left: input.isDown('ArrowLeft'),
      right: input.isDown('ArrowRight'),
      thrust: input.isDown('ArrowUp'),
      brake: input.isDown('ArrowDown'),
    }
    const seq = ++inputSequence
    pendingInputs.push({ seq, input: inputState })
    if (pendingInputs.length > 120) pendingInputs.shift()

    if (gameSocket.networkOptions.prediction) {
      ship.previousPosition = new Vector2(ship.pos.x, ship.pos.y)
      const predicted = integrateShip({
        x: ship.pos.x, y: ship.pos.y,
        vx: ship.vel.x, vy: ship.vel.y, angle: ship.angle,
      }, inputState, FIXED_DT)
      ship.pos.x = ((predicted.x % activeArena.width) + activeArena.width) % activeArena.width
      ship.pos.y = ((predicted.y % activeArena.height) + activeArena.height) % activeArena.height
      ship.angle = predicted.angle
      ship.vel.x = predicted.vx
      ship.vel.y = predicted.vy
    }

    gameSocket.send({ type: 'input', seq, ...inputState })
  }

  pingTimer += dt
  if (pingTimer >= 1 && ownPlayerId) {
    pingTimer -= 1
    gameSocket.send({ type: 'ping', sentAt: Math.round(performance.now()) })
  }

  if (ship.alive) {
    wrapPosition(ship, activeArena.width, activeArena.height)
  }

  for (const asteroid of world.ofKind('asteroid')) {
    wrapPosition(asteroid, activeArena.width, activeArena.height)
  }

  for (const bullet of world.ofKind('bullet')) {
    if (
      bullet.pos.x < 0 ||
      bullet.pos.x > activeArena.width ||
      bullet.pos.y < 0 ||
      bullet.pos.y > activeArena.height
    ) {
      bullet.alive = false
    }
  }

  asteroidSpawnTimer += dt

  const asteroidCount = [...world.ofKind('asteroid')].length

  if (asteroidSpawnTimer >= 7 && asteroidCount < 6) {
    world.spawn(
      new Asteroid(
        Math.random() * activeArena.width,
        Math.random() * activeArena.height,
        18 + Math.random() * 10
      )
    )

    asteroidSpawnTimer = 0
  }

  const pickupCount = [...world.ofKind('pickup')].length

  if (pickupCount === 0) {
    pickupSpawnTimer += dt

    if (pickupSpawnTimer >= 8) {
      world.spawn(
        new Pickup(
          50 + Math.random() * Math.max(0, activeArena.width - 100),
          50 + Math.random() * Math.max(0, activeArena.height - 100),
          createHealing(25)
        )
      )

      pickupSpawnTimer = 0
    }
  } else {
    pickupSpawnTimer = 0
  }

  if (!ship.alive) {
    respawnTimer += dt

    if (respawnTimer >= 2) {
      const spawn = findSafeSpawnPosition()

      ship = new Ship(spawn.x, spawn.y)
      world.spawn(ship)

      respawnTimer = 0
    }
  }
}


function handleKeyDown(event) {
  if (!gameStarted || !ship?.alive || event.repeat) {
    return
  }

  if (event.code === 'Space') {
    event.preventDefault()

    const bullet = ship.fire(world)

    if (bullet && ownPlayerId) {
      gameSocket.send({ type: 'fire', homing: false })
    }
  }

  if (event.code === 'KeyH') {
    event.preventDefault()

    const asteroid = [...world.ofKind('asteroid')][0]

    if (asteroid) {
      const bullet = ship.fireHoming(world, asteroid)

      if (bullet && ownPlayerId) {
        gameSocket.send({ type: 'fire', homing: true })
      }
    }
  }
}



function drawRemoteShip(ctx, player) {
  if (
    !Number.isFinite(player.x) ||
    !Number.isFinite(player.y) ||
    !Number.isFinite(player.angle)
  ) return

  ctx.save()
  ctx.translate(player.x, player.y)
  ctx.rotate(player.angle)

  ctx.strokeStyle = '#64d8ff'
  ctx.fillStyle = 'rgba(100, 216, 255, 0.18)'
  ctx.lineWidth = 2

  ctx.beginPath()
  ctx.moveTo(18, 0)
  ctx.lineTo(-12, -10)
  ctx.lineTo(-7, 0)
  ctx.lineTo(-12, 10)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  if (player.name) {
    ctx.rotate(-player.angle)
    ctx.fillStyle = '#d7f5ff'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(String(player.name).slice(0, 24), 0, 25)
  }

  ctx.restore()
}
function appendChatMessage(name, text) {
  const container = document.querySelector('#chatMessages')
  if (!container) return

  container.querySelector('.chat-empty')?.remove()
  const line = document.createElement('p')
  line.className = 'chat-message'

  const sender = document.createElement('strong')
  sender.textContent = `${String(name || 'Гравець').slice(0, 24)}: `
  const body = document.createElement('span')
  body.textContent = String(text || '').slice(0, 500)

  line.append(sender, body)
  container.appendChild(line)
  while (container.children.length > 50) {
    container.firstElementChild.remove()
  }
  container.scrollTop = container.scrollHeight
}

function render({
  totalSteps,
  stepsPerSecond,
  framesPerSecond,
  frameTime,
}) {
  const width = gameCanvas.width
  const height = gameCanvas.height

  ctx.clearRect(0, 0, width, height)
  drawBackground(ctx, width, height)

  // Розмір і положення арени залежать від вибраної кімнати.
  const scale = Math.min(
    (width - 64) / activeArena.width,
    (height - 64) / activeArena.height,
    1
  )

  const arenaWidth = activeArena.width * scale
  const arenaHeight = activeArena.height * scale
  const offsetX = (width - arenaWidth) / 2
  const offsetY = (height - arenaHeight) / 2

  ctx.save()
  ctx.translate(offsetX, offsetY)
  ctx.scale(scale, scale)

  drawBackground(ctx, activeArena.width, activeArena.height)

  // Видимі межі вибраної арени.
  ctx.strokeStyle = 'rgba(167, 197, 205, 0.8)'
  ctx.lineWidth = 2 / scale
  ctx.strokeRect(
    1,
    1,
    activeArena.width - 2,
    activeArena.height - 2
  )

  for (const asteroid of world.ofKind('asteroid')) {
    drawAsteroid(ctx, asteroid, assets.sprites.asteroid)
  }

  for (const pickup of world.ofKind('pickup')) {
    drawPickup(ctx, pickup)
  }

  for (const bullet of world.ofKind('bullet')) {
    drawBullet(ctx, bullet, assets.sprites.bullet)
  }

  for (const explosion of world.ofKind('explosion')) {
    drawExplosion(ctx, explosion)
  }

  // Render remote ships slightly in the past between received snapshots.
  const renderTime = performance.now() - gameSocket.networkOptions.interpolationMs
  for (const player of remotePlayers.values()) {
    const interpolated = interpolateRemotePlayer(player, renderTime, activeArena)
    if (interpolated) drawRemoteShip(ctx, interpolated)
  }

  if (ship.alive) {
    ctx.save()
    ctx.translate(correctionOffset.x, correctionOffset.y)
    const localAlpha = Math.max(0, Math.min(1, positionSendTimer / FIXED_DT))
    drawShip(ctx, ship, localAlpha, assets.sprites.ship)
    ctx.restore()
  }

  ctx.restore()

  // Статистика HUD.
  document.querySelector('#score').textContent = world.score
  document.querySelector('#steps').textContent = totalSteps
  document.querySelector('#stepsPerSecond').textContent =
    stepsPerSecond.toFixed(1)
  document.querySelector('#framesPerSecond').textContent =
    framesPerSecond.toFixed(1)
  document.querySelector('#frameTime').textContent =
    frameTime.toFixed(2)
  document.querySelector('#x').textContent = ship.pos.x.toFixed(2)
  document.querySelector('#y').textContent = ship.pos.y.toFixed(2)
  document.querySelector('#angle').textContent = ship.angle.toFixed(2)
  document.querySelector('#speed').textContent =
    ship.vel.length().toFixed(1)

  let netgraph = document.querySelector('#netgraph')
  if (!netgraph) {
    netgraph = document.createElement('div')
    netgraph.id = 'netgraph'
    Object.assign(netgraph.style, {
      position: 'fixed', left: '12px', bottom: '8px', padding: '7px 10px',
      background: 'rgba(0, 0, 0, 0.78)', color: '#d8f1ff',
      font: '11px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace',
      zIndex: '1000', border: '1px solid rgba(100,216,255,.35)',
      borderRadius: '6px', pointerEvents: 'none', whiteSpace: 'pre-line',
      maxWidth: 'min(780px, calc(100vw - 24px))',
    })
    document.body.appendChild(netgraph)
  }

  const now = performance.now()
  const statsElapsed = (now - networkStatsAt) / 1000
  if (statsElapsed >= 0.5) {
    const stats = gameSocket.stats
    sentBytesPerSecond = (stats.sentBytes - previousSentBytes) / statsElapsed
    receivedBytesPerSecond = (stats.receivedBytes - previousReceivedBytes) / statsElapsed
    previousSentBytes = stats.sentBytes
    previousReceivedBytes = stats.receivedBytes
    networkStatsAt = now
  }
  const net = gameSocket.networkOptions
  const stats = gameSocket.stats
  const snapshotAge = lastSnapshotReceivedAt ? now - lastSnapshotReceivedAt : Infinity
  netgraph.textContent = [
    `NETGRAPH  ${net.protocol.toUpperCase()}  tick:${lastSnapshotTick}`,
    `RTT: ${stats.lastRttMs == null ? '—' : `${stats.lastRttMs.toFixed(1)} ms`} | snapshot age: ${Number.isFinite(snapshotAge) ? `${snapshotAge.toFixed(1)} ms` : '—'}`,
    `bytes/s: ↑${sentBytesPerSecond.toFixed(0)} ↓${receivedBytesPerSecond.toFixed(0)} | input queue: ${pendingInputs.length}`,
    `correction: ${lastCorrectionMagnitude.toFixed(2)} px | dropped: ${stats.droppedPackets}`,
    `network: ${net.delay} ms +/−${net.jitter} ms, loss ${(net.loss * 100).toFixed(1)}% | interp ${net.interpolationMs} ms | prediction ${net.prediction ? 'ON' : 'OFF'}`,
  ].join('\n')

  const hp = Math.max(0, Math.min(100, ship.hp))
  document.querySelector('#hp').textContent = hp

  const hpBar = document.querySelector('#hpBar')
  const hpProgress = document.querySelector('#hpProgress')

  hpBar.style.width = `${hp}%`
  hpProgress.setAttribute('aria-valuenow', String(hp))

  if (hp > 60) {
    hpBar.style.background =
      'linear-gradient(90deg, #739e8b, #b4d5bd)'
  } else if (hp > 30) {
    hpBar.style.background =
      'linear-gradient(90deg, #c09c62, #e5cc91)'
  } else {
    hpBar.style.background =
      'linear-gradient(90deg, #bd6b70, #e6a0a1)'
  }
}



async function startLoading() {
  if (gameStarted) {
    return
  }

  startButton.disabled = true
  startButton.textContent = 'Завантаження...'

  const controller = new AbortController()

  try {
    // AudioContext створюється тільки після кліку користувача.
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext

    if (!AudioContextClass) {
      throw new Error('Цей браузер не підтримує Web Audio API')
    }

    if (!audioContext) {
      audioContext = new AudioContextClass()
    }

    await audioContext.resume()

    drawLoadingScreen(0, 'Завантажуємо manifest.json...')

    // Читаємо список ресурсів.
    const manifest = await loadJson(
      '/assets/manifest.json',
      { signal: controller.signal }
    )

    // Завантажуємо всі спрайти й звуки паралельно.
    assets = await loadAll(manifest, {
      signal: controller.signal,
      audioContext,

      onProgress(progress) {
        let status = 'Підготовка ресурсів...'

        if (progress.status === 'loaded') {
          status =
            `Завантажено ${progress.item}: ` +
            `${progress.loaded} із ${progress.total}`
        } else if (progress.status === 'error') {
          status = `Помилка ресурсу: ${progress.item}`
        }

        drawLoadingScreen(progress.ratio, status)
      },
    })

    console.info('Ресурси лабораторної роботи 3 завантажено', {
      sprites: Object.keys(assets.sprites),
      sounds: Object.keys(assets.sounds),
      arena: assets.arena,
    })
    
    // Після завантаження ресурсів показуємо лобі.
    loadingScreen.hidden = true
    gameUi.hidden = true
    
    lobbyUI.show()
    lobbyUI.setStatus(
      'Завантажуємо список кімнат...',
      'info'
    )
    
    await lobby.open()
  } catch (error) {
    controller.abort(error)

    const message =
      error?.message || 'Невідома помилка завантаження'

    drawLoadingScreen(
      0,
      `Не вдалося завантажити ресурси: ${message}`
    )

    startButton.disabled = false
    startButton.textContent = 'Спробувати ще раз'

    console.error('Помилка завантаження Lab 3:', error)
  }
}

startButton.addEventListener('click', startLoading)

// Перша заставка до натискання кнопки.
drawLoadingScreen(0, 'Натисни кнопку, щоб підготувати гру')





