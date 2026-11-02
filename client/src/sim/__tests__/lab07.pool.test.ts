import { describe, expect, it } from 'vitest'
import { ParticlePool } from '../particle-pool.js'

describe('particle object pool', () => {
  it('reuses released particle objects and vectors', () => {
    const pool = new ParticlePool()
    const first = pool.acquire(1, 2, 3, 4, 0.5)
    pool.release(first)
    const second = pool.acquire(5, 6, 7, 8, 1)
    expect(second).toBe(first)
    expect(second.pos.x).toBe(5)
    expect(second.velocity.y).toBe(8)
    expect(pool.stats.created).toBe(1)
  })

  it('reports available objects after release', () => {
    const pool = new ParticlePool()
    const particle = pool.acquire(0, 0, 1, 1, 1)
    pool.release(particle)
    expect(pool.stats.available).toBe(1)
  })
})
