import { Vector2 } from './vector.js'
export class ParticlePool {
  free = []
  created = 0
  acquire(x, y, vx, vy, life) {
    const particle = this.free.pop() ?? this.create()
    particle.pos.x = x; particle.pos.y = y
    particle.velocity.x = vx; particle.velocity.y = vy
    particle.life = life
    return particle
  }
  release(particle) { particle.life = 0; this.free.push(particle) }
  get stats() { return { created: this.created, available: this.free.length } }
  create() { this.created++; return { pos: new Vector2(), velocity: new Vector2(), life: 0 } }
}
export const particlePool = new ParticlePool()
