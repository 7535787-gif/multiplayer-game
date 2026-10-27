import type { Room } from './room.js'
import type { RoomPlayer } from './room.js'
declare module 'ws' {
  interface WebSocket {
    protocolFormat?: 'json' | 'binary'
    playerRoomId?: string | null
    player?: RoomPlayer
    room?: Room
    missedPongs?: number
  }
}
