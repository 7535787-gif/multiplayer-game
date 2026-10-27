
import { EventEmitter } from 'node:events'
import { FIXED_DT, integrateShip } from '../../shared/ship-sim.ts'
import { createRandom } from '../../shared/random.ts'

export interface Arena {
  readonly width: number
  readonly height: number
}

export interface PlayerInput {
  readonly left: boolean
  readonly right: boolean
  readonly thrust: boolean
  readonly brake: boolean
}

export interface QueuedInput extends PlayerInput {
  readonly seq: number
}

export interface RoomPlayer {
  readonly id: string
  name: string
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  input: PlayerInput
  inputQueue: QueuedInput[]
  lastSeq: number
  inputSeq: number
  ackSeq: number
}

export interface RoomDefinition {
  readonly id: string
  readonly name: string
  readonly arena: Arena
  readonly maxPlayers?: number
  readonly seed?: number
  readonly persistent?: boolean
}

interface RoomEvents {
  'player-joined': [player: RoomPlayer]
  'player-left': [player: RoomPlayer]
  'chat-message': [message: {
    playerId: string
    name: string
    text: string
  }]
  empty: [roomId: string]
}

export interface SnapshotPlayer {
  readonly id: string
  readonly name: string
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly angle: number
  readonly ackSeq: number
  readonly lastProcessedSeq: number
}

export interface RoomSnapshot {
  readonly type: 'snapshot'
  readonly tick: number
  readonly seed: number
  readonly players: readonly SnapshotPlayer[]
}

export class Room extends EventEmitter<RoomEvents> {
  readonly id: string
  readonly name: string
  readonly arena: Arena
  readonly maxPlayers: number
  readonly players = new Map<string, RoomPlayer>()
  readonly seed: number

  private tick = 0
  private readonly random: () => number

  constructor({
    id,
    name,
    arena,
    maxPlayers = 4,
    seed = 1,
  }: RoomDefinition) {
    super()
    this.id = id
    this.name = name
    this.arena = arena
    this.maxPlayers = maxPlayers
    this.seed = seed >>> 0
    this.random = createRandom(this.seed)
  }

  join(player: RoomPlayer): boolean {
    if (this.players.has(player.id)) return true
    if (this.players.size >= this.maxPlayers) return false

    const spawnAngle = this.random() * Math.PI * 2
    const spawnRadius = 55 + this.random() * 45

    player.x = Math.max(
      24,
      Math.min(
        this.arena.width - 24,
        this.arena.width / 2 + Math.cos(spawnAngle) * spawnRadius,
      ),
    )
    player.y = Math.max(
      24,
      Math.min(
        this.arena.height - 24,
        this.arena.height / 2 + Math.sin(spawnAngle) * spawnRadius,
      ),
    )

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

  setInput(playerId: string, input: QueuedInput): boolean {
    const player = this.players.get(playerId)

    if (
      !player ||
      !Number.isSafeInteger(input.seq) ||
      input.seq < 0 ||
      input.seq <= player.lastSeq
    ) {
      return false
    }

    player.lastSeq = input.seq
    player.inputQueue.push({
      seq: input.seq,
      left: input.left,
      right: input.right,
      thrust: input.thrust,
      brake: input.brake,
    })

    if (player.inputQueue.length > 120) {
      player.inputQueue.shift()
    }

    return true
  }

  simulateStep(): void {
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

      const next = integrateShip(player, player.input, FIXED_DT)

      player.x =
        ((next.x % this.arena.width) + this.arena.width) %
        this.arena.width
      player.y =
        ((next.y % this.arena.height) + this.arena.height) %
        this.arena.height
      player.vx = next.vx
      player.vy = next.vy
      player.angle = next.angle

      if (player.inputSeq > player.ackSeq) {
        player.ackSeq = player.inputSeq
      }
    }
  }

  snapshot(): RoomSnapshot {
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

  leave(playerId: string): void {
    const player = this.players.get(playerId)
    if (!player) return

    this.players.delete(playerId)
    this.emit('player-left', player)

    if (this.players.size === 0) {
      this.emit('empty', this.id)
    }
  }

  recordChat(player: RoomPlayer, text: string): void {
    this.emit('chat-message', {
      playerId: player.id,
      name: player.name,
      text,
    })
  }

  toJSON(): {
    id: string
    name: string
    arena: Arena
    maxPlayers: number
    players: number
  } {
    return {
      id: this.id,
      name: this.name,
      arena: this.arena,
      maxPlayers: this.maxPlayers,
      players: this.players.size,
    }
  }
}
