import { Vector2 } from './vector.js'

export interface PooledParticle { pos: Vector2; velocity: Vector2; life: number }

/** Reuses particle records and their vectors to avoid per-frame allocation churn. */
export class ParticlePool {
  private readonly free: PooledParticle[] = []
  private created = 0
  acquire(x: number, y: number, vx: number, vy: number, life: number): PooledParticle {
    const particle = this.free.pop() ?? this.create()
    particle.pos.x = x; particle.pos.y = y
    particle.velocity.x = vx; particle.velocity.y = vy
    particle.life = life
    return particle
  }
  release(particle: PooledParticle): void {
    particle.life = 0
    this.free.push(particle)
  }
  get stats(): Readonly<{ created: number; available: number }> { return { created: this.created, available: this.free.length } }
  private create(): PooledParticle {
    this.created++
    return { pos: new Vector2(), velocity: new Vector2(), life: 0 }
  }
}

export const particlePool = new ParticlePool()
