import { Entity } from './entity.js'
import { Vector2 } from './vector.js'

export class Bullet extends Entity {
  constructor(
    position,
    angle,
    inheritedVelocity,
    homing = null
  ) {
    const direction =
      Vector2.fromAngle(angle)

    const bulletSpeed = 700

    const velocity =
      inheritedVelocity.add(
        direction.scale(bulletSpeed)
      )

    super({
      pos: position,
      vel: velocity,
      angle,
      radius: 4,
      kind: 'bullet',
    })

    this.previousPosition = this.pos

    this.ttl = 2
    this.damage = 25
    this.homing = homing
  }

  update(dt) {
    this.previousPosition = this.pos

    if (this.homing) {
      this.homing.update(
        this,
        dt
      )
    }

    this.pos = this.pos.add(
      this.vel.scale(dt)
    )

    this.ttl -= dt

    if (this.ttl <= 0) {
      this.alive = false
    }
  }
}