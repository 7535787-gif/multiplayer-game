import { describe, expect, it, vi } from 'vitest'
import { Vector2 } from '../sim/vector.js'
import { createLoop, type LoopScheduler } from '../loop.js'

describe('client Vector2', () => {
  it.each(Array.from({ length: 20 }, (_, index) => index))('vector arithmetic case %i', (index) => {
    const a = new Vector2(index, index + 1)
    const b = new Vector2(2, 3)
    expect(a.add(b)).toEqual(new Vector2(index + 2, index + 4))
    expect(a.sub(b)).toEqual(new Vector2(index - 2, index - 2))
  })
  it('normalizes a zero vector safely', () => expect(new Vector2().normalize()).toEqual(new Vector2()))
  it('rotates a vector by a right angle', () => {
    const rotated = new Vector2(1, 0).rotate(Math.PI / 2)
    expect(rotated.x).toBeCloseTo(0)
    expect(rotated.y).toBeCloseTo(1)
  })
  it('dot product is symmetric', () => expect(new Vector2(2, 5).dot(new Vector2(3, 7))).toBe(new Vector2(3, 7).dot(new Vector2(2, 5))))
  it('fromAngle creates the expected direction and magnitude', () => {
    expect(Vector2.fromAngle(0, 4)).toEqual(new Vector2(4, 0))
  })
})

describe('fixed-step game loop', () => {
  it('accumulates elapsed time into fixed 60 Hz updates', () => {
    let now = 0
    let callback: ((time: number) => void) | undefined
    const scheduler: LoopScheduler = {
      now: () => now,
      request: (next) => { callback = next; return 1 },
      cancel: vi.fn(),
    }
    const update = vi.fn()
    const render = vi.fn()
    const stop = createLoop(update, render, scheduler)
    now = 50
    callback?.(now)
    expect(update).toHaveBeenCalledTimes(3)
    expect(render).toHaveBeenCalledTimes(1)
    stop()
  })
  it('caps a long frame to avoid a spiral of death', () => {
    let callback: ((time: number) => void) | undefined
    const scheduler: LoopScheduler = { now: () => 0, request: (next) => { callback = next; return 1 }, cancel: vi.fn() }
    const update = vi.fn()
    const stop = createLoop(update, vi.fn(), scheduler)
    callback?.(1000)
    expect(update.mock.calls.length).toBeLessThanOrEqual(6)
    stop()
  })
  it('stop cancels the scheduled frame and prevents more work', () => {
    let callback: ((time: number) => void) | undefined
    const cancel = vi.fn()
    const scheduler: LoopScheduler = { now: () => 0, request: (next) => { callback = next; return 7 }, cancel }
    const update = vi.fn()
    const stop = createLoop(update, vi.fn(), scheduler)
    stop()
    callback?.(100)
    expect(cancel).toHaveBeenCalledWith(7)
    expect(update).not.toHaveBeenCalled()
  })
})

import { Entity } from '../sim/entity.js'
import { World } from '../sim/world.js'
import { resolveCollisions } from '../sim/collision.js'

class TestTarget extends Entity {
  hits = 0
  constructor(x: number, y: number, radius = 10) {
    super({ pos: new Vector2(x, y), radius, kind: 'asteroid' })
  }
  takeDamage(): void { this.hits += 1 }
}

describe('collision edge cases', () => {
  it('detects circles that exactly touch', () => {
    const world = new World()
    const target = world.spawn(new TestTarget(20, 0, 10))
    const bullet = world.spawn(Object.assign(new Entity({ pos: new Vector2(0, 0), radius: 10, kind: 'bullet' }), { damage: 1, ownerId: null }))
    resolveCollisions(world)
    expect(bullet.alive).toBe(false)
    expect(target.hits).toBe(1)
  })
  it('detects overlapping circles', () => {
    const world = new World()
    const target = world.spawn(new TestTarget(5, 0, 10))
    world.spawn(Object.assign(new Entity({ pos: new Vector2(0, 0), radius: 10, kind: 'bullet' }), { damage: 1, ownerId: null }))
    resolveCollisions(world)
    expect(target.hits).toBe(1)
  })
  it('does not report a collision when circles miss', () => {
    const world = new World()
    const target = world.spawn(new TestTarget(100, 100, 5))
    world.spawn(Object.assign(new Entity({ pos: new Vector2(0, 0), radius: 2, kind: 'bullet' }), { damage: 1, ownerId: null }))
    resolveCollisions(world)
    expect(target.hits).toBe(0)
  })
  it('uses swept segment collision to detect a fast bullet tunnelling through a target', () => {
    const world = new World()
    const target = world.spawn(new TestTarget(50, 0, 5))
    const bullet = Object.assign(new Entity({ pos: new Vector2(100, 0), radius: 2, kind: 'bullet' }), { damage: 1, ownerId: null, previousPosition: new Vector2(0, 0) })
    world.spawn(bullet)
    resolveCollisions(world)
    expect(bullet.alive).toBe(false)
    expect(target.hits).toBe(1)
  })
})
