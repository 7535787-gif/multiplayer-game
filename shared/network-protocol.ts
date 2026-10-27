import type { ShipInput, Snapshot } from './types.js'

const MAGIC_0 = 0x4d // M
const MAGIC_1 = 0x47 // G
export const BINARY_PROTOCOL_VERSION = 1
const TYPE_INPUT = 1
const TYPE_SNAPSHOT = 2
const INPUT_PACKET_SIZE = 9
const INPUT_KEYS: readonly (keyof ShipInput)[] = ['left', 'right', 'thrust', 'brake']
const POSITION_KEYS: readonly ('x' | 'y' | 'vx' | 'vy')[] = ['x', 'y', 'vx', 'vy']
const SNAPSHOT_HEADER_SIZE = 13
const PLAYER_FIXED_SIZE = 24
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function assertPacketHeader(view: DataView, expectedType: number): void {
  if (view.byteLength < 4 || view.getUint8(0) !== MAGIC_0 || view.getUint8(1) !== MAGIC_1) {
    throw new TypeError('Invalid binary packet signature')
  }
  if (view.getUint8(2) !== BINARY_PROTOCOL_VERSION) {
    throw new TypeError('Unsupported binary protocol version')
  }
  if (view.getUint8(3) !== expectedType) {
    throw new TypeError('Unexpected binary packet type')
  }
}

export interface BinaryInput extends ShipInput { readonly type: 'input'; readonly seq: number }
export interface SnapshotPacket {
  readonly type: 'snapshot'
  readonly tick: number
  readonly seed: number
  readonly players: readonly { readonly id: string; readonly name: string; readonly x: number; readonly y: number; readonly vx: number; readonly vy: number; readonly angle: number; readonly ackSeq: number }[]
}
export type DecodedPacket = BinaryInput | SnapshotPacket

export function encodeInput(input: BinaryInput) {
  if (!Number.isSafeInteger(input?.seq) || input.seq < 0 || input.seq > 0xffffffff) {
    throw new RangeError('input.seq must be an unsigned 32-bit integer')
  }
  for (const key of INPUT_KEYS) {
    if (typeof input[key] !== 'boolean') throw new TypeError(`input.${key} must be boolean`)
  }
  const buffer = new ArrayBuffer(INPUT_PACKET_SIZE)
  const view = new DataView(buffer)
  view.setUint8(0, MAGIC_0)
  view.setUint8(1, MAGIC_1)
  view.setUint8(2, BINARY_PROTOCOL_VERSION)
  view.setUint8(3, TYPE_INPUT)
  view.setUint32(4, input.seq >>> 0, true)
  const flags = (input.left ? 1 : 0) | (input.right ? 2 : 0) | (input.thrust ? 4 : 0) | (input.brake ? 8 : 0)
  view.setUint8(8, flags)
  return buffer
}


export function encodeSnapshot(snapshot: Snapshot | SnapshotPacket): ArrayBuffer {
  if (!Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0 || snapshot.tick > 0xffffffff) {
    throw new RangeError('snapshot.tick must be an unsigned 32-bit integer')
  }

  if (!Number.isSafeInteger(snapshot.seed) || snapshot.seed < 0 || snapshot.seed > 0xffffffff) {
    throw new RangeError('snapshot.seed must be an unsigned 32-bit integer')
  }

  if (!Array.isArray(snapshot.players) || snapshot.players.length > 255) {
    throw new RangeError('snapshot.players must contain between 0 and 255 players')
  }

  const encodedPlayers = snapshot.players.map((player) => {
    if (typeof player.id !== 'string' || typeof player.name !== 'string') {
      throw new TypeError('player.id and player.name must be strings')
    }

    const id = encoder.encode(player.id)
    const name = encoder.encode(player.name)

    if (id.length > 255 || name.length > 255) {
      throw new RangeError('player.id and player.name must be at most 255 UTF-8 bytes')
    }

    for (const key of POSITION_KEYS) {
      if (!Number.isFinite(player[key])) {
        throw new TypeError(`player.${key} must be finite`)
      }
    }

    if (!Number.isFinite(player.angle) || player.angle < -Math.PI || player.angle > Math.PI) {
      throw new RangeError('player.angle must be finite and between -PI and PI')
    }

    if (!Number.isSafeInteger(player.ackSeq) || player.ackSeq < -1 || player.ackSeq > 0xfffffffe) {
      throw new RangeError('player.ackSeq must be -1 or an unsigned 32-bit integer')
    }

    return { player, id, name }
  })

  const totalSize = SNAPSHOT_HEADER_SIZE + encodedPlayers.reduce(
    (size, item) => size + PLAYER_FIXED_SIZE + item.id.length + item.name.length,
    0,
  )

  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  view.setUint8(0, MAGIC_0)
  view.setUint8(1, MAGIC_1)
  view.setUint8(2, BINARY_PROTOCOL_VERSION)
  view.setUint8(3, TYPE_SNAPSHOT)
  view.setUint32(4, snapshot.tick, true)
  view.setUint32(8, snapshot.seed, true)
  view.setUint8(12, encodedPlayers.length)

  let offset = SNAPSHOT_HEADER_SIZE

  for (const { player, id, name } of encodedPlayers) {
    view.setUint8(offset, id.length)
    offset += 1
    view.setUint8(offset, name.length)
    offset += 1

    bytes.set(id, offset)
    offset += id.length
    bytes.set(name, offset)
    offset += name.length

    for (const key of POSITION_KEYS) {
      view.setFloat32(offset, player[key], true)
      offset += 4
    }

    view.setInt16(
      offset,
      Math.max(-32767, Math.min(32767, Math.round(player.angle / Math.PI * 32767))),
      true,
    )
    offset += 2

    view.setUint32(offset, player.ackSeq === -1 ? 0xffffffff : player.ackSeq, true)
    offset += 4
  }

  return buffer
}


export function decodePacket(input: ArrayBuffer | ArrayBufferView | { buffer: ArrayBuffer; byteOffset?: number; byteLength?: number }): DecodedPacket {
  let buffer: ArrayBuffer
  if (input instanceof ArrayBuffer) {
    buffer = input
  } else if (ArrayBuffer.isView(input)) {
    const copy = new Uint8Array(input.byteLength)
    copy.set(new Uint8Array(input.buffer, input.byteOffset, input.byteLength))
    buffer = copy.buffer
  } else {
    const offset = input.byteOffset ?? 0
    const length = input.byteLength ?? input.buffer.byteLength
    buffer = input.buffer.slice(offset, offset + length)
  }
  if (!buffer) throw new TypeError('Expected an ArrayBuffer or byte view')
  const view = new DataView(buffer)
  if (view.byteLength < 4 || view.getUint8(0) !== MAGIC_0 || view.getUint8(1) !== MAGIC_1) {
    throw new TypeError('Invalid binary packet signature')
  }
  const version = view.getUint8(2)
  if (version !== BINARY_PROTOCOL_VERSION) throw new TypeError('Unsupported binary protocol version')
  const type = view.getUint8(3)

  if (type === TYPE_INPUT) {
    assertPacketHeader(view, TYPE_INPUT)
    if (view.byteLength !== INPUT_PACKET_SIZE) throw new TypeError('Invalid input packet size')
    const flags = view.getUint8(8)
    if (flags & 0xf0) throw new TypeError('Invalid input flags')
    return {
      type: 'input',
      seq: view.getUint32(4, true),
      left: Boolean(flags & 1),
      right: Boolean(flags & 2),
      thrust: Boolean(flags & 4),
      brake: Boolean(flags & 8),
    }
  }

  if (type === TYPE_SNAPSHOT) {
    assertPacketHeader(view, TYPE_SNAPSHOT)
    if (view.byteLength < SNAPSHOT_HEADER_SIZE) throw new TypeError('Invalid snapshot packet size')
    const tick = view.getUint32(4, true)
    const seed = view.getUint32(8, true)
    const count = view.getUint8(12)
    const bytes = new Uint8Array(buffer)
    const players = []
    let offset = SNAPSHOT_HEADER_SIZE
    for (let index = 0; index < count; index++) {
      if (offset + 2 > view.byteLength) throw new TypeError('Truncated snapshot player header')
      const idLength = view.getUint8(offset); offset += 1
      const nameLength = view.getUint8(offset); offset += 1
      const required = idLength + nameLength + PLAYER_FIXED_SIZE - 2
      if (offset + required > view.byteLength) throw new TypeError('Truncated snapshot player data')
      const id = decoder.decode(bytes.subarray(offset, offset + idLength)); offset += idLength
      const name = decoder.decode(bytes.subarray(offset, offset + nameLength)); offset += nameLength
      const x = view.getFloat32(offset, true); offset += 4
      const y = view.getFloat32(offset, true); offset += 4
      const vx = view.getFloat32(offset, true); offset += 4
      const vy = view.getFloat32(offset, true); offset += 4
      const angle = view.getInt16(offset, true) / 32767 * Math.PI; offset += 2
      const rawAck = view.getUint32(offset, true); offset += 4
      players.push({ id, name, x, y, vx, vy, angle, ackSeq: rawAck === 0xffffffff ? -1 : rawAck })
    }
    if (offset !== view.byteLength) throw new TypeError('Unexpected trailing snapshot bytes')
    return { type: 'snapshot', tick, seed, players }
  }

  throw new TypeError(`Unknown binary packet type: ${type}`)
}
