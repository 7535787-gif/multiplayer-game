import { Entity } from './entity.js'
import { Vector2 } from './vector.js'

export class Explosion extends Entity {
  constructor(position) {
    super({
      pos: position,
      vel: new Vector2(0, 0),
      angle: 0,
      radius: 30,
      kind: 'explosion',
    })

    this.ttl = 0.6
    this.particles = []

    for (let i = 0; i < 12; i++) {
      const angle =
        Math.random() * Math.PI * 2

      const speed =
        50 + Math.random() * 150

      this.particles.push({
        pos: new Vector2(0, 0),
        velocity: Vector2.fromAngle(
          angle,
          speed
        ),
        life: 0.3 + Math.random() * 0.3,
      })
    }
  }

  update(dt) {
    this.ttl -= dt

    for (const particle of this.particles) {
      particle.pos =
        particle.pos.add(
          particle.velocity.scale(dt)
        )

      particle.life -= dt
    }

    if (this.ttl <= 0) {
      this.alive = false
    }
  }
}