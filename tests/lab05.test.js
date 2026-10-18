import test from 'node:test'
import assert from 'node:assert/strict'
import { FIXED_DT, integrateShip } from '../shared/ship-sim.js'
import { reconcileShipState } from '../shared/reconciliation.js'
import { interpolateRemotePlayer } from '../shared/interpolation.js'
import { createRandom } from '../shared/random.js'
import { decodePacket, encodeInput, encodeSnapshot } from '../shared/network-protocol.js'
import { Room } from '../server/src/room.js'
import { validateMessage } from '../server/src/protocol.js'

test('shared ship simulation is deterministic for the same state and inputs', () => {
  const initial = { x: 500, y: 350, vx: 0, vy: 0, angle: 0 }
  const input = { left: false, right: true, thrust: true, brake: false }
  let a = initial
  let b = initial
  for (let i = 0; i < 300; i++) {
    a = integrateShip(a, input, FIXED_DT)
    b = integrateShip(b, input, FIXED_DT)
  }
  assert.deepEqual(a, b)
  assert.ok(a.angle >= -Math.PI && a.angle <= Math.PI)
})

test('seeded random generator repeats its sequence', () => {
  const a = createRandom(123456)
  const b = createRandom(123456)
  assert.deepEqual(Array.from({ length: 8 }, a), Array.from({ length: 8 }, b))
})

test('binary input packet uses versioned little-endian DataView fields', () => {
  const input = { type: 'input', seq: 0x01020304, left: true, right: false, thrust: true, brake: false }
  const packet = encodeInput(input)
  const view = new DataView(packet)
  assert.equal(view.getUint8(2), 1)
  assert.equal(view.getUint32(4, true), input.seq)
  assert.deepEqual(decodePacket(packet), input)
})

test('binary snapshots round-trip IDs, names, state, seed, tick and ack sequence', () => {
  const snapshot = {
    type: 'snapshot', tick: 42, seed: 9876,
    players: [{ id: 'player-1', name: 'Pilot', x: 10.5, y: 20.25, vx: -4, vy: 5, angle: 1.25, ackSeq: 77 }],
  }
  const decoded = decodePacket(encodeSnapshot(snapshot))
  assert.equal(decoded.tick, snapshot.tick)
  assert.equal(decoded.seed, snapshot.seed)
  assert.equal(decoded.players[0].id, 'player-1')
  assert.equal(decoded.players[0].name, 'Pilot')
  assert.equal(decoded.players[0].x, snapshot.players[0].x)
  assert.equal(decoded.players[0].ackSeq, 77)
  assert.ok(Math.abs(decoded.players[0].angle - 1.25) < 0.0001)
})

test('server rejects client-supplied coordinates and accepts input/fire actions', () => {
  assert.equal(validateMessage({ type: 'state', x: 1, y: 2, angle: 0 }).valid, false)
  assert.equal(validateMessage({ type: 'input', seq: 0, left: false, right: false, thrust: true, brake: false }).valid, true)
  assert.equal(validateMessage({ type: 'fire', homing: false }).valid, true)
  assert.equal(validateMessage({ type: 'fire', homing: false, x: 999999, y: 999999, angle: 99 }).valid, false)
})

test('room acknowledges an input only after consuming it in a simulation tick', () => {
  const room = new Room({ id: 'test', name: 'Test', arena: { width: 1000, height: 700 }, seed: 7 })
  const player = { id: 'p1', name: 'Pilot' }
  room.join(player)
  assert.equal(room.snapshot().players[0].ackSeq, -1)
  room.setInput(player.id, { seq: 1, left: false, right: false, thrust: true, brake: false })
  assert.equal(room.snapshot().players[0].ackSeq, -1)
  room.simulateStep()
  const state = room.snapshot().players[0]
  assert.equal(state.ackSeq, 1)
  assert.ok(state.x !== 0 || state.y !== 0)
})


test('reconciliation drops acknowledged inputs and replays only the remaining inputs', () => {
  const authoritativeState = { x: 100, y: 100, vx: 0, vy: 0, angle: 0 }
  const pendingInputs = [
    { seq: 10, input: { left: false, right: false, thrust: true, brake: false } },
    { seq: 11, input: { left: true, right: false, thrust: true, brake: false } },
  ]
  const result = reconcileShipState({
    authoritativeState,
    pendingInputs,
    acknowledgedSeq: 10,
    currentState: { x: 102, y: 100 },
    arena: { width: 1000, height: 700 },
  })

  assert.deepEqual(result.pendingInputs.map((item) => item.seq), [11])
  const expected = integrateShip(authoritativeState, pendingInputs[1].input, FIXED_DT)
  assert.ok(Math.abs(result.state.x - expected.x) < 1e-8)
  assert.ok(Math.abs(result.state.y - expected.y) < 1e-8)
  assert.equal(result.state.vx, expected.vx)
  assert.equal(result.state.vy, expected.vy)
  assert.equal(result.state.angle, expected.angle)
  assert.ok(result.correctionMagnitude >= 0)
  assert.equal(typeof result.correctionOffset.x, 'number')
})

test('reconciliation does not replay acknowledged commands', () => {
  const state = { x: 100, y: 100, vx: 0, vy: 0, angle: 0 }
  const result = reconcileShipState({
    authoritativeState: state,
    pendingInputs: [{ seq: 3, input: { left: false, right: false, thrust: true, brake: false } }],
    acknowledgedSeq: 3,
    currentState: state,
  })
  assert.deepEqual(result.pendingInputs, [])
  assert.deepEqual(result.state, state)
})

test('remote interpolation blends positions between buffered snapshots', () => {
  const player = {
    name: 'Remote',
    samples: [
      { x: 100, y: 200, angle: 0, receivedAt: 1000 },
      { x: 200, y: 300, angle: 1, receivedAt: 1100 },
    ],
  }
  const result = interpolateRemotePlayer(player, 1050)
  assert.equal(result.x, 150)
  assert.equal(result.y, 250)
  assert.equal(result.angle, 0.5)
})

test('remote interpolation follows the shortest angular path across pi', () => {
  const player = {
    name: 'Remote',
    samples: [
      { x: 0, y: 0, angle: Math.PI - 0.1, receivedAt: 0 },
      { x: 10, y: 10, angle: -Math.PI + 0.1, receivedAt: 100 },
    ],
  }
  const result = interpolateRemotePlayer(player, 50)
  assert.ok(Math.abs(Math.abs(result.angle) - Math.PI) < 0.001)
})

test('binary codec rejects truncated and unsupported-version packets', () => {
  assert.throws(() => decodePacket(new Uint8Array([0x4d, 0x47, 1, 2])), /snapshot packet size/)
  const packet = encodeInput({ type: 'input', seq: 1, left: false, right: false, thrust: false, brake: false })
  new DataView(packet).setUint8(2, 99)
  assert.throws(() => decodePacket(packet), /Unsupported binary protocol version/)
})


test('remote interpolation crosses arena edges along the shortest path', () => {
  const player = {
    name: 'Remote',
    samples: [
      { x: 990, y: 50, angle: 0, receivedAt: 0 },
      { x: 10, y: 50, angle: 0, receivedAt: 100 },
    ],
  }
  const result = interpolateRemotePlayer(player, 50, { width: 1000, height: 700 })
  assert.ok(result.x < 1 || result.x > 999)
  assert.equal(result.y, 50)
})


test('room spawn positions repeat when the same seed is used', () => {
  const createSpawn = () => {
    const room = new Room({ id: 'seeded', name: 'Seeded', arena: { width: 1000, height: 700 }, seed: 4242 })
    const player = { id: 'pilot', name: 'Pilot' }
    room.join(player)
    return { x: player.x, y: player.y }
  }
  assert.deepEqual(createSpawn(), createSpawn())
})
