
import { Vector2 } from './vector.js'

export type EntityKind =
  | 'entity'
  | 'ship'
  | 'bullet'
  | 'asteroid'
  | 'pickup'
  | 'explosion'

export interface EntityOptions {
  pos?: Vector2
  vel?: Vector2
  angle?: number
  radius?: number
  kind?: EntityKind
}

export class Entity {
  static #nextId = 1
  readonly #id: number

  pos: Vector2
  vel: Vector2
  angle: number
  radius: number
  kind: EntityKind
  alive: boolean
  damageCooldown?: number
  previousPosition?: Vector2

  constructor({
    pos = new Vector2(),
    vel = new Vector2(),
    angle = 0,
    radius = 10,
    kind = 'entity',
  }: EntityOptions = {}) {
    this.#id = Entity.#nextId++
    this.pos = pos
    this.vel = vel
    this.angle = angle
    this.radius = radius
    this.kind = kind
    this.alive = true
  }

  get id(): number {
    return this.#id
  }

  update(_dt: number, ..._args: unknown[]): void {
    this.pos = this.pos.add(this.vel.scale(_dt))
  }
}
