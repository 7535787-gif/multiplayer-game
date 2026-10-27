
import { Entity } from './entity.js'
import { Vector2 } from './vector.js'
import type { HomingBehavior } from './homing.js'

export class Asteroid extends Entity {
  #hp = 25
  homing: HomingBehavior | null

  constructor(
    x: number,
    y: number,
    radius = 25,
    homing: HomingBehavior | null = null,
  ) {
    const angle = Math.random() * Math.PI * 2
    const speed = 35 + Math.random() * 55

    super({
      pos: new Vector2(x, y),
      vel: Vector2.fromAngle(angle, speed),
      angle: 0,
      radius,
      kind: 'asteroid',
    })

    this.homing = homing
  }

  get hp(): number {
    return this.#hp
  }

  takeDamage(amount: number): void {
    this.#hp -= amount

    if (this.#hp <= 0) {
      this.#hp = 0
      this.alive = false
    }
  }

  override update(dt: number): void {
    if (this.homing) {
      this.homing.update(this, dt)
    }

    this.pos = this.pos.add(this.vel.scale(dt))
    this.angle += 0.5 * dt
  }
}
