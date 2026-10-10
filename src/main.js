import './style.css'

import { createLoop } from './loop.js'
import { createInput } from './input.js'

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
          <h1 class="hud-title">DOGFIGHT // SIMULATION</h1>
          <p class="hud-subtitle">
            <span class="status-indicator"></span>
            SYSTEM ONLINE · TRAINING MODE
          </p>
        </div>
      </header>

      <div class="metrics-grid">
        <div class="metric metric--accent">
          <span class="metric-label">SCORE / РАХУНОК</span>
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
          <span class="metric-label">ANGLE / КУТ</span>
          <strong class="metric-value" id="angle">0</strong>
        </div>
      </div>
    </section>

    <section class="controls-panel">
      <h2 class="controls-title">FLIGHT CONTROLS / КЕРУВАННЯ</h2>

      <ul class="controls-list">
        <li class="control-item"><kbd>↑</kbd><span>Тяга</span></li>
        <li class="control-item"><kbd>↓</kbd><span>Гальмо / назад</span></li>
        <li class="control-item">
          <kbd>←</kbd><kbd>→</kbd><span>Поворот</span>
        </li>
        <li class="control-item">
          <kbd>Space</kbd><span>Постріл</span>
        </li>
        <li class="control-item"><kbd>H</kbd><span>Homing</span></li>
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
const gameCanvas = createCanvas()

app.appendChild(gameCanvas.canvas)
const lobby = new Lobby()
const lobbyUI = new LobbyUI(app)

const { ctx, width: initialWidth, height: initialHeight } =
  gameCanvas

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

// Гравець натиснув кнопку приєднання.
lobbyUI.addEventListener('join-request', (event) => {
  const { playerName, roomId } = event.detail

  lobbyUI.setBusy(true)

  try {
    lobby.join(playerName, roomId)
  } catch (error) {
    lobbyUI.setBusy(false)
    lobbyUI.setStatus(error.message, 'error')
  }
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
    'DEEP SPACE  /  FLIGHT SYSTEM',
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

  // Реальний прогрес, отриманий із loadAll().
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

function update(dt) {
  world.step(dt, input)

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
    ship.fire(world)
  }

  if (event.code === 'KeyH') {
    event.preventDefault()

    const asteroid = [...world.ofKind('asteroid')][0]

    if (asteroid) {
      ship.fireHoming(world, asteroid)
    }
  }
}


function render({
  totalSteps,
  stepsPerSecond,
  framesPerSecond,
  frameTime,
  alpha,
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

  if (ship.alive) {
    drawShip(ctx, ship, alpha, assets.sprites.ship)
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
            `${progress.loaded} з ${progress.total}`
        } else if (progress.status === 'error') {
          status = `Помилка ресурсу: ${progress.item}`
        }

        drawLoadingScreen(progress.ratio, status)
      },
    })

    console.info('Ресурси Lab 3 завантажено', {
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