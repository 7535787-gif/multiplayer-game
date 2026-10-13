import { Entity } from './entity.js'
import { Vector2 } from './vector.js'

export class Pickup extends Entity {
  constructor(x, y, behavior) {
    super({
      pos: new Vector2(x, y),
      vel: new Vector2(0, 0),
      angle: 0,
      radius: 12,
      kind: 'pickup',
    })

    this.behavior = behavior
  }

  update() {
    // Pickup залишається нерухомим.
  }

  applyTo(target) {
    if (this.behavior) {
      this.behavior.apply(target)
    }
  }
}