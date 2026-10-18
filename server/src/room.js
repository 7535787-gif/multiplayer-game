import { EventEmitter } from 'node:events'
import { FIXED_DT, integrateShip } from '../../shared/ship-sim.js'
import { createRandom } from '../../shared/random.js'

export class Room extends EventEmitter {
  constructor({ id, name, arena, maxPlayers = 4, seed = 1 }) {
    super()
    this.id = id
    this.name = name
    this.arena = arena
    this.maxPlayers = maxPlayers
    this.players = new Map()
    this.tick = 0
    this.seed = seed >>> 0
    this.random = createRandom(this.seed)
  }

  
  join(player) {
    if (this.players.has(player.id)) return true
    if (this.players.size >= this.maxPlayers) return false

    // Розміщуємо гравців біля центру арени,
    // щоб кораблі не з'являлися в куті (0, 0).
    const spawnAngle = this.random() * Math.PI * 2
    const spawnRadius = 55 + this.random() * 45

    player.x = Math.max(24, Math.min(this.arena.width - 24,
      this.arena.width / 2 + Math.cos(spawnAngle) * spawnRadius))
    player.y = Math.max(24, Math.min(this.arena.height - 24,
      this.arena.height / 2 + Math.sin(spawnAngle) * spawnRadius))
    player.angle = 0
    player.vx = 0
    player.vy = 0
    player.input = {
      left: false,
      right: false,
      thrust: false,
      brake: false,
    }
    player.inputQueue = []
    player.lastSeq = -1
    player.inputSeq = -1
    player.ackSeq = -1

    this.players.set(player.id, player)
    this.emit('player-joined', player)
    return true
  }


  setInput(playerId, input) {
    const player = this.players.get(playerId)
    if (
      !player ||
      !Number.isSafeInteger(input.seq) ||
      input.seq < 0 ||
      input.seq <= player.lastSeq ||
      !['left', 'right', 'thrust', 'brake'].every((key) => typeof input[key] === 'boolean')
    ) return false

    player.lastSeq = input.seq
    player.inputQueue.push({
      seq: input.seq,
      left: input.left,
      right: input.right,
      thrust: input.thrust,
      brake: input.brake,
    })
    // Bound memory under severe artificial latency; normal 30 Hz traffic never reaches this.
    if (player.inputQueue.length > 120) player.inputQueue.shift()
    return true
  }

  simulateStep() {
    this.tick++

    for (const player of this.players.values()) {
      const nextInput = player.inputQueue.shift()
      if (nextInput) {
        player.inputSeq = nextInput.seq
        player.input = {
          left: nextInput.left,
          right: nextInput.right,
          thrust: nextInput.thrust,
          brake: nextInput.brake,
        }
      }
      const next = integrateShip(player, player.input ?? { left: false, right: false, thrust: false, brake: false }, FIXED_DT)
      player.x = ((next.x % this.arena.width) + this.arena.width) % this.arena.width
      player.y = ((next.y % this.arena.height) + this.arena.height) % this.arena.height
      player.vx = next.vx
      player.vy = next.vy
      player.angle = next.angle
      // A sequence is acknowledged only after the simulation consumed it.
      if (player.inputSeq > player.ackSeq) player.ackSeq = player.inputSeq
    }
  }

  snapshot() {
    return {
      type: 'snapshot',
      tick: this.tick,
      seed: this.seed,
      players: [...this.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        x: player.x,
        y: player.y,
        vx: player.vx,
        vy: player.vy,
        angle: player.angle,
        ackSeq: player.ackSeq,
        lastProcessedSeq: player.ackSeq,
      })),
    }
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