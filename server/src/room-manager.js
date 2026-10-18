import { randomBytes } from 'node:crypto'
import { Room } from './room.js'

export class RoomManager {
  constructor({ maxRooms = 20, onRoomCreated = () => {} } = {}) {
    this.rooms = new Map()
    this.maxRooms = maxRooms
    this.onRoomCreated = onRoomCreated
  }

  
  create(definition) {
    if (this.rooms.has(definition.id)) {
      throw new Error(`Кімната ${definition.id} вже існує`)
    }

    if (this.rooms.size >= this.maxRooms) {
      throw new Error('Досягнуто ліміту кімнат')
    }

    const seed = definition.seed ?? randomBytes(4).readUInt32LE(0)
    const room = new Room({ ...definition, seed })

    room.once('empty', () => {
      // Стандартні кімнати не видаляємо.
      if (definition.persistent) return

      // Тимчасові кімнати видаляємо, коли вони спорожніли.
      if (this.rooms.get(room.id) === room) {
        this.rooms.delete(room.id)
      }
    })

    this.onRoomCreated(room)
    this.rooms.set(room.id, room)

    return room
  }

  get(id) {
    return this.rooms.get(id)
  }

  has(id) {
    return this.rooms.has(id)
  }

  get size() {
    return this.rooms.size
  }

  values() {
    return this.rooms.values()
  }

  delete(id) {
    return this.rooms.delete(id)
  }

}