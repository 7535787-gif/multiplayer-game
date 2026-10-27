
import { Entity } from './entity.js'
import { Vector2 } from './vector.js'
import type { HomingBehavior } from './homing.js'

export class Bullet extends Entity {
  ttl = 2
  damage = 25
  homing: HomingBehavior | null
  ownerId: number | null

  constructor(
    position: Vector2,
    angle: number,
    inheritedVelocity: Vector2,
    homing: HomingBehavior | null = null,
    ownerId: number | null = null,
  ) {
    const direction = Vector2.fromAngle(angle)
    const bulletSpeed = 700
    const velocity = inheritedVelocity.add(
      direction.scale(bulletSpeed),
    )

    super({
      pos: position,
      vel: velocity,
      angle,
      radius: 4,
      kind: 'bullet',
    })

    this.previousPosition = this.pos
    this.homing = homing
    this.ownerId = ownerId
  }

  override update(dt: number): void {
    this.previousPosition = this.pos

    if (this.homing) {
      this.homing.update(this, dt)
    }

    this.pos = this.pos.add(this.vel.scale(dt))
    this.ttl -= dt

    if (this.ttl <= 0) {
      this.alive = false
    }
  }
}
