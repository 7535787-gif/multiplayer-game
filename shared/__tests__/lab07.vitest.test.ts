import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { integrateShip, FIXED_DT } from '../ship-sim.ts'
import { reconcileShipState } from '../reconciliation.ts'
import {
  encodeInput,
  decodePacket,
  encodeSnapshot,
} from '../network-protocol.ts'
import { parseClientMessage, parseServerMessage, jsonSnapshotCodec, binarySnapshotCodec, snapshotSchema, clientMessageSchema } from '../protocol.ts'
import { interpolateRemotePlayer } from '../interpolation.ts'
import { createRandom } from '../random.ts'

import type {
  ShipInput,
  ShipState,
  Snapshot,
  Tick,
  EntityId,
  Seq,
} from '../types.ts'

const neutral: ShipInput = {
  left: false,
  right: false,
  thrust: false,
  brake: false,
}

const initialState: ShipState = {
  x: 100,
  y: 100,
  vx: 0,
  vy: 0,
  angle: 0,
}

const validInputArbitrary = fc.record({
  left: fc.boolean(),
  right: fc.boolean(),
  thrust: fc.boolean(),
  brake: fc.boolean(),
})

const validClientMessageArbitrary = fc.oneof(
  fc.record({
    type: fc.constant('join' as const),
    roomId: fc.string({ minLength: 1, maxLength: 40 })
      .filter((value) => value.trim().length > 0),
    name: fc.string({ minLength: 1, maxLength: 20 })
      .filter((value) => value.trim().length > 0),
  }),
  fc.record({
    type: fc.constant('input' as const),
    seq: fc.integer({ min: 0, max: 0xffffffff }),
    left: fc.boolean(),
    right: fc.boolean(),
    thrust: fc.boolean(),
    brake: fc.boolean(),
  }),
  fc.record({
    type: fc.constant('ping' as const),
    sentAt: fc.double({
      noNaN: true,
      noDefaultInfinity: true,
    }),
  }),
  fc.record({
    type: fc.constant('chat' as const),
    text: fc.string({ minLength: 1, maxLength: 100 })
      .filter((value) => value.trim().length > 0),
  }),
  fc.record({
    type: fc.constant('fire' as const),
    homing: fc.boolean(),
  }),
)

describe('shared: deterministic ship integration', () => {
  it('keeps state stable with neutral input', () => {
    expect(integrateShip(initialState, neutral)).toEqual(initialState)
  })

  it('rejects invalid time steps', () => {
    const invalidSteps = [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]

    for (const dt of invalidSteps) {
      expect(() => integrateShip(initialState, neutral, dt))
        .toThrow(RangeError)
    }
  })

  it('accelerates the ship along its heading', () => {
    const next = integrateShip(initialState, {
      ...neutral,
      thrust: true,
    })

    expect(next.vx).toBeGreaterThan(0)
    expect(next.vy).toBeCloseTo(0)
  })

  it('keeps speed below the configured maximum', () => {
    const next = integrateShip(
      { ...initialState, vx: 10000, vy: 10000 },
      neutral,
    )

    expect(Math.hypot(next.vx, next.vy))
      .toBeLessThanOrEqual(250)
  })

  it('normalizes the angle into [-PI, PI)', () => {
    const next = integrateShip(
      { ...initialState, angle: 1000 },
      { ...neutral, right: true },
    )

    expect(next.angle).toBeGreaterThanOrEqual(-Math.PI)
    expect(next.angle).toBeLessThan(Math.PI)
  })

  it('uses the fixed simulation step by default', () => {
    const defaultStep = integrateShip(initialState, {
      ...neutral,
      thrust: true,
    })

    const explicitStep = integrateShip(
      initialState,
      { ...neutral, thrust: true },
      FIXED_DT,
    )

    expect(defaultStep).toEqual(explicitStep)
  })

  it('produces the same result for identical inputs', () => {
    const input: ShipInput = {
      ...neutral,
      thrust: true,
      right: true,
    }

    expect(integrateShip(initialState, input))
      .toEqual(integrateShip(initialState, input))
  })
})

describe('shared: reconciliation as a pure function', () => {
  it('does not mutate its input state or pending inputs', () => {
    const pending = [
      {
        seq: 1,
        input: { ...neutral, thrust: true },
      },
    ]

    const stateBefore = structuredClone(initialState)
    const pendingBefore = structuredClone(pending)

    reconcileShipState({
      authoritativeState: initialState,
      pendingInputs: pending,
      acknowledgedSeq: 0,
      currentState: initialState,
    })

    expect(initialState).toEqual(stateBefore)
    expect(pending).toEqual(pendingBefore)
  })

  it('removes acknowledged inputs and replays the remaining ones', () => {
    const pending = [1, 2, 3].map((seq) => ({
      seq,
      input: { ...neutral, thrust: true },
    }))

    const result = reconcileShipState({
      authoritativeState: initialState,
      pendingInputs: pending,
      acknowledgedSeq: 1,
      currentState: initialState,
    })

    expect(result.pendingInputs.map((item) => item.seq))
      .toEqual([2, 3])
  })

  it('returns zero correction when states match', () => {
    const result = reconcileShipState({
      authoritativeState: initialState,
      pendingInputs: [],
      acknowledgedSeq: -1,
      currentState: initialState,
    })

    expect(result.correctionMagnitude).toBe(0)
    expect(result.correctionOffset.x).toBe(0)
    expect(result.correctionOffset.y).toBe(0)
  })

  it('rejects an invalid acknowledged sequence', () => {
    expect(() =>
      reconcileShipState({
        authoritativeState: initialState,
        pendingInputs: [],
        acknowledgedSeq: -2,
        currentState: initialState,
      }),
    ).toThrow(RangeError)
  })

  it('does not change the authoritative state object', () => {
    const before = structuredClone(initialState)

    reconcileShipState({
      authoritativeState: initialState,
      pendingInputs: [
        {
          seq: 1,
          input: { ...neutral, thrust: true },
        },
      ],
      acknowledgedSeq: 0,
      currentState: initialState,
    })

    expect(initialState).toEqual(before)
  })
})

describe('shared: binary protocol properties', () => {
  it('preserves generated input messages after encode and decode', () => {
    fc.assert(
      fc.property(
        validInputArbitrary,
        fc.integer({ min: 0, max: 0xffffffff }),
        (input, seq) => {
          const message = {
            type: 'input' as const,
            seq,
            ...input,
          }

          const decoded = decodePacket(encodeInput(message))

          expect(decoded).toEqual(message)
        },
      ),
      { numRuns: 250 },
    )
  })

  it('produces packets with the expected fixed length', () => {
    fc.assert(
      fc.property(
        validInputArbitrary,
        fc.integer({ min: 0, max: 0xffffffff }),
        (input, seq) => {
          const packet = encodeInput({
            type: 'input',
            seq,
            ...input,
          })

          expect(packet.byteLength).toBe(9)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('rejects arbitrary malformed binary buffers safely', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ maxLength: 80 }),
        (bytes) => {
          expect(() => decodePacket(bytes)).toThrow()
        },
      ),
      { numRuns: 300 },
    )
  })

  it('rejects truncated input packets', () => {
    const truncatedPacket = new Uint8Array([
      0x4d,
      0x47,
      1,
      1,
    ])

    expect(() => decodePacket(truncatedPacket)).toThrow()
  })

  it('rejects unknown binary packet types', () => {
    const unknownPacket = new Uint8Array([
      0x4d,
      0x47,
      1,
      99,
    ])

    expect(() => decodePacket(unknownPacket))
      .toThrow(/Unknown binary packet type/)
  })

  it('preserves snapshot data within angle quantization tolerance', () => {
    const snapshot: Snapshot = {
      type: 'snapshot',
      tick: 1 as Tick,
      seed: 42,
      players: [
        {
          id: 'p1' as EntityId,
          name: 'pilot',
          x: 1.25,
          y: 2.5,
          vx: 3,
          vy: 4,
          angle: 0.7,
          ackSeq: 3 as Seq,
        },
      ],
    }

    const decoded = decodePacket(encodeSnapshot(snapshot))

    expect(decoded.type).toBe('snapshot')

    if (decoded.type === 'snapshot') {
      expect(decoded.players[0]?.angle).toBeCloseTo(0.7, 4)
    }
  })

  it('accepts generated valid client messages', () => {
    fc.assert(
      fc.property(
        validClientMessageArbitrary,
        (message) => {
          expect(parseClientMessage(message).ok).toBe(true)
        },
      ),
      { numRuns: 250 },
    )
  })

  it('rejects generated messages with unexpected fields', () => {
    fc.assert(
      fc.property(
        validClientMessageArbitrary,
        (message) => {
          const mutated = {
            ...message,
            unexpectedField: true,
          }

          expect(parseClientMessage(mutated).ok).toBe(false)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('rejects malformed protocol values', () => {
    const malformedValues: unknown[] = [
      null,
      undefined,
      1,
      'join',
      [],
      {},
      { type: 'fire' },
      { type: 'chat', text: '' },
    ]

    for (const value of malformedValues) {
      expect(parseClientMessage(value).ok).toBe(false)
    }
  })
})

describe('shared: interpolation', () => {
  const player = {
    name: 'pilot',
    samples: [
      { x: 10, y: 20, angle: 0, receivedAt: 100 },
      { x: 30, y: 40, angle: Math.PI / 2, receivedAt: 200 },
    ],
  }

  it('returns null for missing players and empty samples', () => {
    expect(interpolateRemotePlayer(null, 150)).toBeNull()
    expect(interpolateRemotePlayer(undefined, 150)).toBeNull()
    expect(interpolateRemotePlayer({ name: 'empty', samples: [] }, 150)).toBeNull()
  })

  it('returns the first sample before its timestamp', () => {
    expect(interpolateRemotePlayer(player, 50)).toEqual({ ...player.samples[0], name: 'pilot' })
  })

  it('returns the only sample when there is one', () => {
    const single = { name: 'solo', samples: [player.samples[0]!] }
    expect(interpolateRemotePlayer(single, 150)).toEqual({ ...player.samples[0], name: 'solo' })
  })

  it('interpolates between samples', () => {
    const result = interpolateRemotePlayer(player, 150)
    expect(result?.x).toBe(20)
    expect(result?.y).toBe(30)
    expect(result?.receivedAt).toBe(150)
  })

  it('uses shortest angular path across the PI boundary', () => {
    const wrapped = {
      name: 'wrap',
      samples: [
        { x: 0, y: 0, angle: Math.PI - 0.1, receivedAt: 0 },
        { x: 10, y: 0, angle: -Math.PI + 0.1, receivedAt: 100 },
      ],
    }
    const result = interpolateRemotePlayer(wrapped, 50)
    expect(Math.abs(result!.angle)).toBeCloseTo(Math.PI, 5)
  })

  it('interpolates across arena edges using the shortest path', () => {
    const wrapped = {
      name: 'wrap',
      samples: [
        { x: 990, y: 690, angle: 0, receivedAt: 0 },
        { x: 10, y: 10, angle: 0, receivedAt: 100 },
      ],
    }
    const result = interpolateRemotePlayer(wrapped, 50, { width: 1000, height: 700 })
    expect(result?.x).toBeCloseTo(0)
    expect(result?.y).toBeCloseTo(0)
  })

  it('returns the last sample after the newest timestamp', () => {
    expect(interpolateRemotePlayer(player, 300)).toEqual({ ...player.samples[1], name: 'pilot' })
  })
})

describe('shared: deterministic random generator', () => {
  it('returns the same sequence for the same seed', () => {
    const first = createRandom(123)
    const second = createRandom(123)
    expect(Array.from({ length: 20 }, first)).toEqual(Array.from({ length: 20 }, second))
  })

  it('returns values in the half-open interval [0, 1)', () => {
    const random = createRandom(42)
    for (let i = 0; i < 1000; i++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('normalizes negative and oversized seeds to unsigned 32-bit values', () => {
    const a = createRandom(-1)
    const b = createRandom(0xffffffff)
    expect(a()).toBe(b())
  })
})

describe('shared: protocol schemas and codecs', () => {
  const validSnapshot: Snapshot = {
    type: 'snapshot',
    tick: 2 as Tick,
    seed: 9,
    players: [{
      id: 'pilot-1' as EntityId,
      name: 'Pilot',
      x: 1,
      y: 2,
      vx: 3,
      vy: 4,
      angle: 0.5,
      ackSeq: 4 as Seq,
    }],
  }

  it('parses valid server snapshots and rejects malformed snapshots', () => {
    expect(snapshotSchema.safeParse(validSnapshot).success).toBe(true)
    expect(snapshotSchema.safeParse({ ...validSnapshot, tick: -1 }).success).toBe(false)
    expect(snapshotSchema.safeParse({ ...validSnapshot, extra: true }).success).toBe(false)
  })

  it('parses valid server messages and rejects unknown variants', () => {
    expect(parseServerMessage({ type: 'joined', playerId: 'p1', roomId: 'r1' }).ok).toBe(true)
    expect(parseServerMessage({ type: 'pong', sentAt: 1, serverTime: 2 }).ok).toBe(true)
    expect(parseServerMessage({ type: 'chat', playerId: 'p1', name: 'A', text: 'hello' }).ok).toBe(true)
    expect(parseServerMessage({ type: 'player-joined', playerId: 'p2', name: 'B' }).ok).toBe(true)
    expect(parseServerMessage({ type: 'player-left', playerId: 'p2' }).ok).toBe(true)
    expect(parseServerMessage({ type: 'unknown' }).ok).toBe(false)
  })

  it('round-trips snapshots through the JSON codec', () => {
    const encoded = jsonSnapshotCodec.encode(validSnapshot)
    expect(typeof encoded).toBe('string')
    expect(jsonSnapshotCodec.decode(encoded)).toEqual(validSnapshot)
  })

  it('rejects invalid JSON codec inputs', () => {
    expect(() => jsonSnapshotCodec.decode(new ArrayBuffer(2))).toThrow(TypeError)
    expect(() => jsonSnapshotCodec.decode('{broken')).toThrow()
    expect(() => jsonSnapshotCodec.encode({ ...validSnapshot, tick: -1 as Tick })).toThrow()
  })

  it('round-trips snapshots through the binary codec', () => {
    const encoded = binarySnapshotCodec.encode(validSnapshot)
    expect(encoded).toBeInstanceOf(ArrayBuffer)
    const decoded = binarySnapshotCodec.decode(encoded as ArrayBuffer)
    expect(decoded.type).toBe('snapshot')
    if (decoded.type === 'snapshot') {
      expect(decoded.tick).toBe(validSnapshot.tick)
      expect(decoded.players[0]?.x).toBeCloseTo(1)
    }
  })

  it('rejects wrong binary codec inputs and packet variants', () => {
    expect(() => binarySnapshotCodec.decode('not binary')).toThrow(TypeError)
    const inputPacket = encodeInput({ type: 'input', seq: 1, left: false, right: false, thrust: false, brake: false })
    expect(() => binarySnapshotCodec.decode(inputPacket)).toThrow(/expected a snapshot/i)
  })

  it('validates binary input fields before encoding', () => {
    expect(() => encodeInput({ type: 'input', seq: -1, left: false, right: false, thrust: false, brake: false })).toThrow(RangeError)
    expect(() => encodeInput({ type: 'input', seq: 1, left: 1 as unknown as boolean, right: false, thrust: false, brake: false })).toThrow(TypeError)
  })

  it('rejects invalid snapshot fields before binary encoding', () => {
    expect(() => encodeSnapshot({ ...validSnapshot, seed: -1 })).toThrow(RangeError)
    expect(() => encodeSnapshot({ ...validSnapshot, players: Array.from({ length: 256 }, (_, i) => ({ ...validSnapshot.players[0]!, id: `p${i}` as EntityId })) })).toThrow(RangeError)
    expect(() => encodeSnapshot({ ...validSnapshot, players: [{ ...validSnapshot.players[0]!, angle: 4 }] })).toThrow(RangeError)
  })

  it('rejects snapshot packets with trailing bytes', () => {
    const packet = encodeSnapshot(validSnapshot)
    const bytes = new Uint8Array(packet.byteLength + 1)
    bytes.set(new Uint8Array(packet))
    expect(() => decodePacket(bytes)).toThrow(/trailing snapshot bytes/i)
  })

  it('rejects invalid client schema values', () => {
    expect(clientMessageSchema.safeParse({ type: 'join', roomId: ' ', name: 'Pilot' }).success).toBe(false)
    expect(clientMessageSchema.safeParse({ type: 'input', seq: -1, left: false, right: false, thrust: false, brake: false }).success).toBe(false)
  })
})

describe('shared: reconciliation with arena wrapping', () => {
  it('wraps replayed positions into the arena', () => {
    const result = reconcileShipState({
      authoritativeState: { ...initialState, x: 995, y: 695, vx: 100, vy: 100 },
      pendingInputs: [{ seq: 1, input: { ...neutral, thrust: true } }],
      acknowledgedSeq: 0,
      currentState: { x: 5, y: 5 },
      arena: { width: 1000, height: 700 },
    })
    expect(result.state.x).toBeGreaterThanOrEqual(0)
    expect(result.state.x).toBeLessThan(1000)
    expect(result.state.y).toBeGreaterThanOrEqual(0)
    expect(result.state.y).toBeLessThan(700)
  })

  it('uses shortest wrapped correction offsets', () => {
    const result = reconcileShipState({
      authoritativeState: { ...initialState, x: 990, y: 10 },
      pendingInputs: [],
      acknowledgedSeq: -1,
      currentState: { x: 10, y: 690 },
      arena: { width: 1000, height: 700 },
    })
    expect(Math.abs(result.correctionOffset.x)).toBe(20)
    expect(Math.abs(result.correctionOffset.y)).toBe(20)
  })
})
