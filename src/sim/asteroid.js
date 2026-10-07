import { Entity } from './entity.js'
import { Vector2 } from './vector.js'

export class Asteroid extends Entity {
  #hp = 25

  constructor(x, y, radius = 25, homing = null) {
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

  get hp() {
    return this.#hp
  }

  takeDamage(amount) {
    this.#hp -= amount

    if (this.#hp <= 0) {
      this.#hp = 0
      this.alive = false
    }
  }

  update(dt) {
    if (this.homing) {
      this.homing.update(this, dt)
    }

    this.pos = this.pos.add(
      this.vel.scale(dt)
    )

    this.angle += 0.5 * dt
  }
}