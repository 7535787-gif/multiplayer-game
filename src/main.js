import './style.css'

import { createLoop } from './loop.js'
import { createInput } from './input.js'
import { createShip, integrate } from './sim/ship.js'
import { wrapPosition } from './sim/arena.js'

import { createCanvas } from './render/canvas.js'
import { drawShip } from './render/draw.js'

document.querySelector('#app').innerHTML = `
  <h1>Гра на JavaScript</h1>

  <p>Лабораторія 01 — Цикл подій та цикл ігор</p>

  <p>
    Кроки: <span id="steps">0</span>
  </p>

  <p>
    Steps/s: <span id="stepsPerSecond">0</span>
  </p>

  <p>
    Frames/s: <span id="framesPerSecond">0</span>
  </p>

  <p>
    Frame time: <span id="frameTime">0</span> ms
  </p>

  <p>
    X: <span id="x">0</span>
  </p>

  <p>
    Y: <span id="y">0</span>
  </p>

  <p>
    Кут: <span id="angle">0</span>
  </p>

  <p>
    Швидкість: <span id="speed">0</span>
  </p>

  <p>
    Сила гальмування: <span id="braking">350</span>
  </p>

  <p>
    ↑ — рух вперед, ↓ — гальмо / назад, ← → — поворот
  </p>
`

const input = createInput()

const ship = createShip(400, 300)

const gameCanvas = createCanvas(800, 600)

document
  .querySelector('#app')
  .appendChild(gameCanvas.canvas)

const stepsElement =
  document.querySelector('#steps')

const stepsPerSecondElement =
  document.querySelector('#stepsPerSecond')

const framesPerSecondElement =
  document.querySelector('#framesPerSecond')

const frameTimeElement =
  document.querySelector('#frameTime')

const xElement =
  document.querySelector('#x')

const yElement =
  document.querySelector('#y')

const angleElement =
  document.querySelector('#angle')

const speedElement =
  document.querySelector('#speed')

// Оновлення фізики
function update(dt) {
  integrate(ship, input, dt)

  wrapPosition(
    ship,
    gameCanvas.width,
    gameCanvas.height
  )
}

// Рендер
function render({
  totalSteps,
  stepsPerSecond,
  framesPerSecond,
  frameTime,
  alpha,
}) {
  const { ctx } = gameCanvas

  ctx.clearRect(
    0,
    0,
    gameCanvas.width,
    gameCanvas.height
  )

  // Передаємо alpha для інтерполяції
  drawShip(ctx, ship, alpha)

  // HUD
  stepsElement.textContent = totalSteps

  stepsPerSecondElement.textContent =
    stepsPerSecond.toFixed(1)

  framesPerSecondElement.textContent =
    framesPerSecond.toFixed(1)

  frameTimeElement.textContent =
    frameTime.toFixed(2)

  xElement.textContent =
    ship.x.toFixed(2)

  yElement.textContent =
    ship.y.toFixed(2)

  angleElement.textContent =
    ship.angle.toFixed(2)

  // Поточна швидкість
  const speed = Math.sqrt(
    ship.vx * ship.vx +
    ship.vy * ship.vy
  )

  speedElement.textContent =
    speed.toFixed(1)
}

createLoop(update, render)