import { describe, expect, it, vi } from 'vitest'
import { RoomManager } from '../room-manager.ts'

const definition = (id: string, maxPlayers = 4) => ({
  id,
  name: `Room ${id}`,
  arena: { width: 1000, height: 700 },
  maxPlayers,
  seed: 42,
})

describe('RoomManager limits', () => {
  it('does not allow creating more rooms than maxRooms', () => {
    const manager = new RoomManager({ maxRooms: 2 })

    manager.create(definition('room-1'))
    manager.create(definition('room-2'))

    expect(manager.size).toBe(2)
    expect(() => manager.create(definition('room-3'))).toThrow()
    expect(manager.size).toBe(2)
  })

  it('does not allow duplicate room IDs', () => {
    const manager = new RoomManager()

    manager.create(definition('room-1'))

    expect(() => manager.create(definition('room-1'))).toThrow()
    expect(manager.size).toBe(1)
  })

  it('allows creating a room after another room is deleted', () => {
    const manager = new RoomManager({ maxRooms: 1 })

    manager.create(definition('room-1'))
    expect(manager.delete('room-1')).toBe(true)

    expect(() => manager.create(definition('room-2'))).not.toThrow()
    expect(manager.size).toBe(1)
  })

  it('calls onRoomCreated when a room is created', () => {
    const onRoomCreated = vi.fn()
    const manager = new RoomManager({ onRoomCreated })

    const room = manager.create(definition('room-1'))

    expect(onRoomCreated).toHaveBeenCalledOnce()
    expect(onRoomCreated).toHaveBeenCalledWith(room)
  })

  it('keeps persistent rooms after they become empty', () => {
    const manager = new RoomManager()
    const room = manager.create({
      ...definition('persistent-room'),
      persistent: true,
    })

    room.join({
      id: 'player-1',
      name: 'Player',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      input: { left: false, right: false, thrust: false, brake: false },
      inputQueue: [],
      lastSeq: -1,
      inputSeq: -1,
      ackSeq: -1,
    })

    room.leave('player-1')

    expect(manager.has('persistent-room')).toBe(true)
  })

  it('removes an empty non-persistent room after its last player leaves', () => {
    const manager = new RoomManager()
    const room = manager.create(definition('temporary-room'))

    room.join({
      id: 'player-1',
      name: 'Player',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      input: { left: false, right: false, thrust: false, brake: false },
      inputQueue: [],
      lastSeq: -1,
      inputSeq: -1,
      ackSeq: -1,
    })

    room.leave('player-1')

    expect(manager.has('temporary-room')).toBe(false)
  })
})

describe('Room player limits', () => {
    const player = (id: string) => ({
      id,
      name: id,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      input: { left: false, right: false, thrust: false, brake: false },
      inputQueue: [],
      lastSeq: -1,
      inputSeq: -1,
      ackSeq: -1,
    })

    it('does not allow more players than maxPlayers', () => {
      const manager = new RoomManager()
      const room = manager.create(definition('limited-room', 2))

      expect(room.join(player('p1'))).toBe(true)
      expect(room.join(player('p2'))).toBe(true)
      expect(room.join(player('p3'))).toBe(false)

      expect(room.players.size).toBe(2)
    })

    it('allows a new player after another player leaves', () => {
      const manager = new RoomManager()
      const room = manager.create(definition('limited-room', 1))

      expect(room.join(player('p1'))).toBe(true)
      room.leave('p1')

      expect(room.join(player('p2'))).toBe(true)
      expect(room.players.size).toBe(1)
    })
  })
