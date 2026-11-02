import { describe, expect, it } from 'vitest'
import { Room } from '../room.ts'
import { createTokenBucket } from '../rate-limiter.js'

const input = { left: false, right: false, thrust: true, brake: false }
function player(id: string) {
  return { id, name: id, x: 0, y: 0, vx: 0, vy: 0, angle: 0, input: { left: false, right: false, thrust: false, brake: false }, inputQueue: [], lastSeq: -1, inputSeq: -1, ackSeq: -1 }
}

describe('server room determinism', () => {
  it('two rooms with the same seed produce identical snapshots', () => {
    const a = new Room({ id: 'a', name: 'A', arena: { width: 1000, height: 700 }, seed: 42 })
    const b = new Room({ id: 'b', name: 'B', arena: { width: 1000, height: 700 }, seed: 42 })
    a.join(player('p1')); b.join(player('p1'))
    for (let i = 0; i < 120; i++) { a.setInput('p1', { ...input, seq: i }); b.setInput('p1', { ...input, seq: i }); a.simulateStep(); b.simulateStep() }
    expect(a.snapshot().players).toEqual(b.snapshot().players)
    expect(a.snapshot().tick).toBe(b.snapshot().tick)
  })
  it('rejects duplicate and out-of-order input sequence numbers', () => {
    const room = new Room({ id: 'r', name: 'R', arena: { width: 500, height: 400 }, seed: 1 })
    room.join(player('p'))
    expect(room.setInput('p', { ...input, seq: 2 })).toBe(true)
    expect(room.setInput('p', { ...input, seq: 2 })).toBe(false)
    expect(room.setInput('p', { ...input, seq: 1 })).toBe(false)
  })
  it('advances tick once per simulation step', () => {
    const room = new Room({ id: 'r', name: 'R', arena: { width: 500, height: 400 }, seed: 1 })
    room.simulateStep(); room.simulateStep(); room.simulateStep()
    expect(room.snapshot().tick).toBe(3)
  })
})

describe('per-connection token bucket', () => {
  it('enforces capacity and refills with elapsed time', () => {
    let now = 0
    const bucket = createTokenBucket({ capacity: 2, refillPerSecond: 2, now: () => now })
    expect(bucket.consume()).toBe(true)
    expect(bucket.consume()).toBe(true)
    expect(bucket.consume()).toBe(false)
    now = 500
    expect(bucket.consume()).toBe(true)
  })
  it('does not grant tokens when the clock moves backwards', () => {
    let now = 1000
    const bucket = createTokenBucket({ capacity: 1, refillPerSecond: 1, now: () => now })
    expect(bucket.consume()).toBe(true)
    now = 0
    expect(bucket.consume()).toBe(false)
  })
  it('rejects invalid costs and configurations', () => {
    const bucket = createTokenBucket({ capacity: 2, refillPerSecond: 1, now: () => 0 })
    expect(bucket.consume(0)).toBe(false)
    expect(bucket.consume(Number.NaN)).toBe(false)
    expect(() => createTokenBucket({ capacity: 0, refillPerSecond: 1 })).toThrow(RangeError)
  })
})

import fc from 'fast-check'
import { FIXED_DT, integrateShip } from '../../../shared/ship-sim.js'

describe('property: server-side movement stays inside the wrapped arena', () => {
  it('keeps the ship inside after 1000 arbitrary input steps', () => {
    fc.assert(fc.property(fc.array(fc.record({
      left: fc.boolean(), right: fc.boolean(), thrust: fc.boolean(), brake: fc.boolean(),
    }), { minLength: 1000, maxLength: 1000 }), (inputs) => {
      const width = 1000
      const height = 700
      let state = { x: 500, y: 350, vx: 0, vy: 0, angle: 0 }
      for (const nextInput of inputs) {
        const next = integrateShip(state, nextInput, FIXED_DT)
        state = {
          ...next,
          x: ((next.x % width) + width) % width,
          y: ((next.y % height) + height) % height,
        }
        expect(state.x).toBeGreaterThanOrEqual(0)
        expect(state.x).toBeLessThan(width)
        expect(state.y).toBeGreaterThanOrEqual(0)
        expect(state.y).toBeLessThan(height)
      }
    }), { numRuns: 20 })
  })
})

describe('server bots', () => {
  it('adds bots as ordinary room players and advances their input sequence', async () => {
    const { Room } = await import('../room.ts')
    const { addBots, tickBots } = await import('../bots.ts')
    const room = new Room({ id: 'bots-test', name: 'Bots', arena: { width: 1000, height: 700 }, maxPlayers: 8, seed: 7 })
    const bots = addBots(room, 3)
    expect(bots).toHaveLength(3)
    expect(room.players.size).toBe(3)
    tickBots(room)
    room.simulateStep()
    expect([...room.players.values()].every((player) => player.ackSeq >= 0)).toBe(true)
  })

  it('never adds more bots than the room capacity', async () => {
    const { Room } = await import('../room.ts')
    const { addBots } = await import('../bots.ts')
    const room = new Room({ id: 'bots-capacity', name: 'Bots', arena: { width: 1000, height: 700 }, maxPlayers: 2, seed: 9 })
    expect(addBots(room, 8)).toHaveLength(2)
    expect(addBots(room, 8)).toHaveLength(0)
  })
})
