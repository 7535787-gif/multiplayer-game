import './style.css'

import { createLoop } from './loop.js'
import { createInput } from './input.js'

import { Ship } from './sim/ship.js'
import { World } from './sim/world.js'
import { Asteroid } from './sim/asteroid.js'
import { Pickup } from './sim/pickup.js'
import { createHealing } from './sim/healing.js'
import { wrapPosition } from './sim/arena.js'

import { createCanvas } from './render/canvas.js'

import {
  drawShip,
  drawBullet,
  drawAsteroid,
  drawExplosion,
  drawPickup,
} from './render/draw.js'

document.querySelector('#app').innerHTML = `
  <h1>Гра на JavaScript</h1>

  <p>
    Score: <span id="score">0</span>
  </p>

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
    ↑ — рух вперед,
    ↓ — гальмо / назад,
    ← → — поворот,
    Space — постріл,
    H — самонавідна куля
  </p>

  <p>
    HP: <span id="hp">100</span>
  </p>
`

const input = createInput()
const world = new World()

let ship = new Ship(400, 300)

world.spawn(ship)

world.spawn(
  new Asteroid(150, 150, 20)
)

world.spawn(
  new Asteroid(650, 200, 25)
)

world.spawn(
  new Asteroid(200, 450, 18)
)

world.spawn(
  new Pickup(
    400,
    100,
    createHealing(25)
  )
)

let respawnTimer = 0
let asteroidSpawnTimer = 0
let pickupSpawnTimer = 0

const gameCanvas = createCanvas(800, 600)

document
  .querySelector('#app')
  .appendChild(gameCanvas.canvas)

function findSafeSpawnPosition() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const x =
      50 +
      Math.random() *
        (gameCanvas.width - 100)

    const y =
      50 +
      Math.random() *
        (gameCanvas.height - 100)

    let safe = true

    for (const asteroid of world.ofKind('asteroid')) {
      const dx = x - asteroid.pos.x
      const dy = y - asteroid.pos.y

      const distance = Math.sqrt(
        dx * dx + dy * dy
      )

      if (
        distance <
        asteroid.radius + 15 + 50
      ) {
        safe = false
        break
      }
    }

    if (safe) {
      return { x, y }
    }
  }

  return {
    x: gameCanvas.width / 2,
    y: gameCanvas.height / 2,
  }
}

window.addEventListener(
  'keydown',
  (event) => {
    if (!ship.alive) {
      return
    }

    if (event.code === 'Space') {
      event.preventDefault()

      ship.fire(world)
    }

    if (event.code === 'KeyH') {
      event.preventDefault()

      const asteroid =
        [...world.ofKind('asteroid')][0]

      if (asteroid) {
        ship.fireHoming(
          world,
          asteroid
        )
      }
    }
  }
)

const stepsElement =
  document.querySelector('#steps')

const stepsPerSecondElement =
  document.querySelector(
    '#stepsPerSecond'
  )

const framesPerSecondElement =
  document.querySelector(
    '#framesPerSecond'
  )

const frameTimeElement =
  document.querySelector(
    '#frameTime'
  )

const scoreElement =
  document.querySelector('#score')

const xElement =
  document.querySelector('#x')

const yElement =
  document.querySelector('#y')

const angleElement =
  document.querySelector('#angle')

const speedElement =
  document.querySelector('#speed')

const hpElement =
  document.querySelector('#hp')

function update(dt) {
  world.step(dt, input)

  /*
   * Корабель переміщується через край
   * арени і з'являється з іншого боку.
   */
  if (ship.alive) {
    wrapPosition(
      ship,
      gameCanvas.width,
      gameCanvas.height
    )
  }

  /*
   * Астероїди також переміщуються
   * через край арени.
   */
  for (const asteroid of world.ofKind(
    'asteroid'
  )) {
    wrapPosition(
      asteroid,
      gameCanvas.width,
      gameCanvas.height
    )
  }

  /*
   * Кулі не переміщуються через край.
   * Вони видаляються, якщо залишили арену.
   */
  for (const bullet of world.ofKind(
    'bullet'
  )) {
    if (
      bullet.pos.x < 0 ||
      bullet.pos.x > gameCanvas.width ||
      bullet.pos.y < 0 ||
      bullet.pos.y > gameCanvas.height
    ) {
      bullet.alive = false
    }
  }

  /*
   * Періодичне створення нових астероїдів.
   */
  asteroidSpawnTimer += dt

  const asteroidCount =
    [...world.ofKind('asteroid')]
      .length

  if (
    asteroidSpawnTimer >= 7 &&
    asteroidCount < 6
  ) {
    const x =
      Math.random() *
      gameCanvas.width

    const y =
      Math.random() *
      gameCanvas.height

    const radius =
      18 + Math.random() * 10

    world.spawn(
      new Asteroid(
        x,
        y,
        radius
      )
    )

    asteroidSpawnTimer = 0
  }

  /*
   * Якщо pickup був підібраний,
   * через 8 секунд створюється новий.
   */
  const pickupCount =
    [...world.ofKind('pickup')]
      .length

  if (pickupCount === 0) {
    pickupSpawnTimer += dt

    if (pickupSpawnTimer >= 8) {
      const x =
        50 +
        Math.random() *
          (gameCanvas.width - 100)

      const y =
        50 +
        Math.random() *
          (gameCanvas.height - 100)

      world.spawn(
        new Pickup(
          x,
          y,
          createHealing(25)
        )
      )

      pickupSpawnTimer = 0
    }
  } else {
    pickupSpawnTimer = 0
  }

  /*
   * Якщо корабель знищений,
   * через 2 секунди створюється новий
   * у випадковій безпечній точці.
   */
  if (!ship.alive) {
    respawnTimer += dt

    if (respawnTimer >= 2) {
      const spawn =
        findSafeSpawnPosition()

      ship = new Ship(
        spawn.x,
        spawn.y
      )

      world.spawn(ship)

      respawnTimer = 0
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
  const { ctx } = gameCanvas

  ctx.clearRect(
    0,
    0,
    gameCanvas.width,
    gameCanvas.height
  )

  /*
   * Вибухи.
   */
  for (const explosion of world.ofKind(
    'explosion'
  )) {
    drawExplosion(
      ctx,
      explosion
    )
  }

  /*
   * Корабель.
   */
  if (ship.alive) {
    drawShip(
      ctx,
      ship,
      alpha
    )
  }

  /*
   * Кулі.
   */
  for (const bullet of world.ofKind(
    'bullet'
  )) {
    drawBullet(
      ctx,
      bullet
    )
  }

  /*
   * Астероїди.
   */
  for (const asteroid of world.ofKind(
    'asteroid'
  )) {
    drawAsteroid(
      ctx,
      asteroid
    )
  }

  /*
   * Pickup.
   */
  for (const pickup of world.ofKind(
    'pickup'
  )) {
    drawPickup(
      ctx,
      pickup
    )
  }

  /*
   * HUD.
   */
  scoreElement.textContent =
    world.score

  hpElement.textContent =
    ship.hp

  stepsElement.textContent =
    totalSteps

  stepsPerSecondElement.textContent =
    stepsPerSecond.toFixed(1)

  framesPerSecondElement.textContent =
    framesPerSecond.toFixed(1)

  frameTimeElement.textContent =
    frameTime.toFixed(2)

  xElement.textContent =
    ship.pos.x.toFixed(2)

  yElement.textContent =
    ship.pos.y.toFixed(2)

  angleElement.textContent =
    ship.angle.toFixed(2)

  speedElement.textContent =
    ship.vel.length().toFixed(1)
}

createLoop(
  update,
  render
)