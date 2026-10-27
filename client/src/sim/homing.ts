
import { Vector2 } from './vector.js'
import type { Entity } from './entity.js'

export interface HomingEntity {
  pos: Vector2
  vel: Vector2
  alive: boolean
}

export interface HomingBehavior {
  update(entity: HomingEntity, dt: number): void
}

export function createHoming(
  target: Entity,
  strength = 150,
): HomingBehavior {
  return {
    update(entity, dt): void {
      if (!target || !target.alive) return

      const direction = new Vector2(
        target.pos.x - entity.pos.x,
        target.pos.y - entity.pos.y,
      ).normalize()

      entity.vel = entity.vel.add(direction.scale(strength * dt))

      const speed = entity.vel.length()
      if (speed > 700) {
        entity.vel = entity.vel.normalize().scale(700)
      }
    },
  }
}
