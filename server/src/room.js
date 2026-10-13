import { EventEmitter } from 'node:events'

export class Room extends EventEmitter {
  constructor({ id, name, arena, maxPlayers = 4 }) {
    super()
    this.id = id
    this.name = name
    this.arena = arena
    this.maxPlayers = maxPlayers
    this.players = new Map()
  }

  join(player) {
    if (this.players.has(player.id)) return true
    if (this.players.size >= this.maxPlayers) return false

    player.x = Number.isFinite(player.x) ? player.x : this.arena.width / 2
    player.y = Number.isFinite(player.y) ? player.y : this.arena.height / 2
    player.angle = Number.isFinite(player.angle) ? player.angle : 0

    this.players.set(player.id, player)
    this.emit('player-joined', player)
    return true
  }

  updatePlayer(playerId, state) {
    const player = this.players.get(playerId)
    if (!player) return false

    if (
      !Number.isFinite(state.x) ||
      !Number.isFinite(state.y) ||
      !Number.isFinite(state.angle)
    ) {
      return false
    }

    player.x = Math.max(0, Math.min(this.arena.width, state.x))
    player.y = Math.max(0, Math.min(this.arena.height, state.y))
    player.angle = state.angle
    return true
  }

  leave(playerId) {
    const player = this.players.get(playerId)
    if (!player) return

    this.players.delete(playerId)
    this.emit('player-left', player)

    if (this.players.size === 0) {
      this.emit('empty', this.id)
    }
  }

  recordChat(player, text) {
    this.emit('chat-message', {
      playerId: player.id,
      name: player.name,
      text,
    })
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      arena: this.arena,
      maxPlayers: this.maxPlayers,
      players: this.players.size,
    }
  }
}