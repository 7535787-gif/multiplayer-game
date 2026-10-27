
import { Entity } from './entity.js'
import { Vector2 } from './vector.js'

export interface PickupBehavior {
  apply(target: Entity): void
}

export class Pickup extends Entity {
  behavior: PickupBehavior | null

  constructor(
    x: number,
    y: number,
    behavior: PickupBehavior | null,
  ) {
    super({
      pos: new Vector2(x, y),
      vel: new Vector2(0, 0),
      angle: 0,
      radius: 12,
      kind: 'pickup',
    })

    this.behavior = behavior
  }

  override update(): void {
    // Pickup залишається нерухомим.
  }

  applyTo(target: Entity): void {
    this.behavior?.apply(target)
  }
}
