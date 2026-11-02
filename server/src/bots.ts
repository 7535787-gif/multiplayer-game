import type { Room, RoomPlayer, PlayerInput } from './room.ts'

interface BotState {
  bot: Bot
  player: RoomPlayer
  sequence: number
  phase: number
  fireCooldown: number
}

const roomBots = new WeakMap<Room, Map<string, BotState>>()

/** A bot emits the exact same four-button input shape as a human client. */
export class Bot implements PlayerInput {
  left = false
  right = false
  thrust = false
  brake = false
  shouldFire = false

  constructor(readonly id: string, readonly name: string) {}

  input(): PlayerInput {
    return { left: this.left, right: this.right, thrust: this.thrust, brake: this.brake }
  }

  think(room: Room, player: RoomPlayer, phase: number): void {
    let target: RoomPlayer | undefined
    let nearest = Number.POSITIVE_INFINITY
    for (const candidate of room.players.values()) {
      if (candidate.id === player.id) continue
      const distance = Math.hypot(candidate.x - player.x, candidate.y - player.y)
      if (distance < nearest) { nearest = distance; target = candidate }
    }
    this.shouldFire = false
    if (!target) {
      this.left = Math.sin(phase) > 0.4
      this.right = Math.sin(phase) < -0.4
      this.thrust = true
      this.brake = false
      return
    }

    const dx = target.x - player.x
    const dy = target.y - player.y
    const distance = Math.hypot(dx, dy)
    const desired = Math.atan2(dy, dx)
    let delta = desired - player.angle
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2

    // Close-range evasive weave; otherwise pursue and maintain speed.
    const evade = distance < 115
    const steering = evade ? delta + Math.PI / 2 : delta
    this.left = steering < -0.08
    this.right = steering > 0.08
    this.thrust = distance > 85 || evade
    this.brake = !evade && distance < 180
    this.shouldFire = distance < 650 && Math.abs(delta) < 0.22 && phase % 0.6 < 1 / 30
  }
}

export function addBots(room: Room, count: number): RoomPlayer[] {
  let states = roomBots.get(room)
  if (!states) { states = new Map(); roomBots.set(room, states) }
  const added: RoomPlayer[] = []
  for (let i = 0; i < count && room.players.size < room.maxPlayers; i++) {
    const id = `bot-${crypto.randomUUID()}`
    const bot = new Bot(id, `Bot ${states.size + 1}`)
    const player: RoomPlayer = {
      id, name: bot.name, x: 0, y: 0, vx: 0, vy: 0, angle: 0,
      input: bot.input(), inputQueue: [], lastSeq: -1, inputSeq: -1, ackSeq: -1,
    }
    if (!room.join(player)) break
    states.set(id, { bot, player, sequence: 0, phase: i * 1.7, fireCooldown: 0 })
    added.push(player)
  }
  return added
}

export function tickBots(room: Room): RoomPlayer[] {
  const firing: RoomPlayer[] = []
  const states = roomBots.get(room)
  if (!states) return firing
  for (const [id, state] of states) {
    if (!room.players.has(id)) { states.delete(id); continue }
    const bot = state.bot
    bot.think(room, state.player, state.phase)
    state.phase += 1 / 30
    state.fireCooldown = Math.max(0, state.fireCooldown - 1 / 30)
    if (bot.shouldFire && state.fireCooldown === 0) { firing.push(state.player); state.fireCooldown = 0.6 }
    room.setInput(id, { seq: state.sequence++, ...bot.input() })
  }
  return firing
}
