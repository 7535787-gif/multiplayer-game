import { Vector2 } from './vector.js'

export function createHoming(target, strength = 150) {
  return {
    update(entity, dt) {
      if (!target || !target.alive) {
        return
      }

      const direction = new Vector2(
        target.pos.x - entity.pos.x,
        target.pos.y - entity.pos.y
      ).normalize()

      entity.vel = entity.vel.add(
        direction.scale(strength * dt)
      )

      const speed = entity.vel.length()

      if (speed > 700) {
        entity.vel = entity.vel
          .normalize()
          .scale(700)
      }
    },
  }
}