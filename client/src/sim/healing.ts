
import { Entity } from './entity.js'
import type { PickupBehavior } from './pickup.js'

export interface HealableEntity extends Entity {
  heal(amount: number): void
}

export interface HealingBehavior extends PickupBehavior {
  readonly amount: number
  apply(target: Entity): void
}

export function createHealing(amount = 25): HealingBehavior {
  return {
    amount,

    apply(target: Entity): void {
      if (!(target instanceof Entity) || !('heal' in target) || typeof target.heal !== 'function') {
        return
      }
      target.heal(amount)
    },
  }
}
