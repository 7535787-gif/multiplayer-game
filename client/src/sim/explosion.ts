
import { Entity } from './entity.js'
import { Vector2 } from './vector.js'
import { particlePool } from './particle-pool.js'

export interface ExplosionParticle {
  pos: Vector2
  velocity: Vector2
  life: number
}

export class Explosion extends Entity {
  ttl: number
  particles: ExplosionParticle[]

  constructor(position: Vector2) {
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
      const angle = Math.random() * Math.PI * 2
      const speed = 50 + Math.random() * 150
      const velocity = Vector2.fromAngle(angle, speed)
      this.particles.push(particlePool.acquire(0, 0, velocity.x, velocity.y, 0.3 + Math.random() * 0.3))
    }
  }

  override update(dt: number): void {
    this.ttl -= dt

    for (const particle of this.particles) {
      particle.pos.x += particle.velocity.x * dt
      particle.pos.y += particle.velocity.y * dt
      particle.life -= dt
    }

    if (this.ttl <= 0) {
      this.alive = false
      for (const particle of this.particles) particlePool.release(particle)
      this.particles.length = 0
    }
  }
}
