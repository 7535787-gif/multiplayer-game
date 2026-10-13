import { Vector2 } from './vector.js'

export class Entity {
  static #nextId = 1

  #id = Entity.#nextId++

  constructor({
    pos = new Vector2(),
    vel = new Vector2(),
    angle = 0,
    radius = 10,
    kind = 'entity',
  } = {}) {
    this.pos = pos
    this.vel = vel
    this.angle = angle
    this.radius = radius
    this.kind = kind
    this.alive = true
  }

  get id() {
    return this.#id
  }

  update(dt) {
    this.pos = this.pos.add(
      this.vel.scale(dt)
    )
  }
}