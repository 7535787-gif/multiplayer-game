
import { randomBytes } from 'node:crypto'
import { Room } from './room.ts'

export interface RoomDefinition {
  readonly id: string
  readonly name: string
  readonly arena: {
    readonly width: number
    readonly height: number
  }
  readonly maxPlayers: number
  readonly persistent?: boolean
  readonly seed?: number
}

export interface RoomManagerOptions {
  readonly maxRooms?: number
  readonly onRoomCreated?: (room: Room) => void
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>()
  private readonly maxRooms: number
  private readonly onRoomCreated: (room: Room) => void

  constructor({
    maxRooms = 20,
    onRoomCreated = () => {},
  }: RoomManagerOptions = {}) {
    this.maxRooms = maxRooms
    this.onRoomCreated = onRoomCreated
  }

  create(definition: RoomDefinition): Room {
    if (this.rooms.has(definition.id)) {
      throw new Error(`Кімната ${definition.id} вже існує`)
    }

    if (this.rooms.size >= this.maxRooms) {
      throw new Error('Досягнуто ліміту кімнат')
    }

    const seed =
      definition.seed ?? randomBytes(4).readUInt32LE(0)

    const room = new Room({ ...definition, seed })

    room.once('empty', () => {
      if (definition.persistent) return

      if (this.rooms.get(room.id) === room) {
        this.rooms.delete(room.id)
      }
    })

    this.rooms.set(room.id, room)
    this.onRoomCreated(room)

    return room
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id)
  }

  has(id: string): boolean {
    return this.rooms.has(id)
  }

  get size(): number {
    return this.rooms.size
  }

  values(): MapIterator<Room> {
    return this.rooms.values()
  }

  delete(id: string): boolean {
    return this.rooms.delete(id)
  }
}
