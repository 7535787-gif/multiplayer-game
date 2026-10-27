import type { ShipInput, ShipState } from './types.js'

export const FIXED_DT = 1 / 30

export const SHIP_CONFIG = Object.freeze({
  acceleration: 220,
  rotationSpeed: 2.1,
  maxSpeed: 250,
  braking: 330,
  reverseAcceleration: 90,
  drag: 0.9,
  thrustDrag: 0.15,
})

export function integrateShip(state: ShipState, input: ShipInput, dt: number = FIXED_DT): ShipState {
  if (!Number.isFinite(dt) || dt <= 0) {
    throw new RangeError('dt must be a positive finite number')
  }

  let { x, y, vx, vy, angle } = state
  const config = SHIP_CONFIG

  if (input.left) angle -= config.rotationSpeed * dt
  if (input.right) angle += config.rotationSpeed * dt
  angle = ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI

  if (input.thrust) {
    vx += Math.cos(angle) * config.acceleration * dt
    vy += Math.sin(angle) * config.acceleration * dt
  }

  if (input.brake) {
    const speed = Math.hypot(vx, vy)
    if (speed > 1) {
      const newSpeed = Math.max(0, speed - config.braking * dt)
      const scale = newSpeed / speed
      vx *= scale
      vy *= scale
    } else {
      vx -= Math.cos(angle) * config.reverseAcceleration * dt
      vy -= Math.sin(angle) * config.reverseAcceleration * dt
    }
  }

  const drag = input.thrust ? config.thrustDrag : config.drag
  const damping = Math.exp(-drag * dt)
  vx *= damping
  vy *= damping

  const speed = Math.hypot(vx, vy)
  if (speed > config.maxSpeed) {
    const scale = config.maxSpeed / speed
    vx *= scale
    vy *= scale
  }

  x += vx * dt
  y += vy * dt
  return { x, y, vx, vy, angle }
}
