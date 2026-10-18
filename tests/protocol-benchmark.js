import { encodeInput, encodeSnapshot } from '../shared/network-protocol.js'

const input = {
  type: 'input', seq: 12345,
  left: false, right: true, thrust: true, brake: false,
}
const players = Array.from({ length: 4 }, (_, index) => ({
  id: `player-${index + 1}-0123456789`,
  name: `Pilot ${index + 1}`,
  x: 580.123,
  y: 350.456,
  vx: 12.3,
  vy: -45.6,
  angle: 1.234,
  ackSeq: 9876,
}))
const snapshot = { type: 'snapshot', tick: 123456, seed: 0x12345678, players }
const encoder = new TextEncoder()
const jsonInputBytes = encoder.encode(JSON.stringify(input)).byteLength
const binaryInputBytes = encodeInput(input).byteLength
const jsonSnapshotBytes = encoder.encode(JSON.stringify(snapshot)).byteLength
const binarySnapshotBytes = encodeSnapshot(snapshot).byteLength
const reduction = ((1 - binarySnapshotBytes / jsonSnapshotBytes) * 100).toFixed(1)

console.log('| Packet | JSON bytes | Binary bytes | Reduction |')
console.log('|---|---:|---:|---:|')
console.log(`| Input | ${jsonInputBytes} | ${binaryInputBytes} | ${((1 - binaryInputBytes / jsonInputBytes) * 100).toFixed(1)}% |`)
console.log(`| Snapshot (4 players) | ${jsonSnapshotBytes} | ${binarySnapshotBytes} | ${reduction}% |`)
