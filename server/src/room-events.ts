import type { SnapshotPlayer } from './room.js'

export interface RoomEvents {
  'player-joined': [player: SnapshotPlayer]
  'player-left': [player: SnapshotPlayer]
  'chat-message': [message: { playerId: string; name: string; text: string }]
  empty: [roomId: string]
}

/** Event map for Room's EventEmitter. Keep event names and argument tuples in sync with room.ts. */
export type RoomEventName = keyof RoomEvents
