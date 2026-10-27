import test from 'node:test'
import assert from 'node:assert/strict'
import { parseClientMessage, parseServerMessage, jsonSnapshotCodec } from '../shared/protocol.js'

test('Zod client protocol accepts valid input and rejects malformed data without throwing', () => {
  assert.equal(parseClientMessage({ type: 'input', seq: 0, left: false, right: false, thrust: true, brake: false }).ok, true)
  assert.equal(parseClientMessage({ type: 'input', seq: -1, left: false, right: false, thrust: true, brake: false }).ok, false)
  assert.equal(parseClientMessage(null).ok, false)
})
test('server message schema validates snapshots and JSON codec round-trips them', () => {
  const snapshot = { type: 'snapshot', tick: 1, seed: 7, players: [{ id: 'p1', name: 'Pilot', x: 1, y: 2, vx: 0, vy: 0, angle: 0, ackSeq: 0 }] }
  assert.equal(parseServerMessage(snapshot).ok, true)
  assert.deepEqual(jsonSnapshotCodec.decode(jsonSnapshotCodec.encode(snapshot)), snapshot)
  assert.equal(parseServerMessage({ type: 'snapshot', tick: -1, seed: 7, players: [] }).ok, false)
})
