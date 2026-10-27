
import { resolveCollisions } from './collision.js'
import type { Entity, EntityKind } from './entity.js'
import type { Vector2 } from './vector.js'

export interface WorldStepOptions {
  skipEntityId?: number | null
}

export class World implements Iterable<Entity> {
  #entities = new Map<number, Entity>()
  score = 0

  arena?: { width: number; height: number; name: string }
  roomId?: string

  spawn<T extends Entity>(entity: T): T {
    this.#entities.set(entity.id, entity)
    return entity
  }

  despawn(id: number): void {
    const entity = this.#entities.get(id)
    if (entity) entity.alive = false
  }

  get(id: number): Entity | undefined {
    return this.#entities.get(id)
  }

  *[Symbol.iterator](): IterableIterator<Entity> {
    yield* this.#entities.values()
  }

  *ofKind(kind: EntityKind): IterableIterator<Entity> {
    for (const entity of this) {
      if (entity.kind === kind) yield entity
    }
  }

  step(
    dt: number,
    input?: unknown,
    { skipEntityId = null }: WorldStepOptions = {},
  ): void {
    for (const entity of this) {
      if (!entity.alive) continue

      if (entity.id === skipEntityId) {
        if (typeof entity.damageCooldown === 'number' && entity.damageCooldown > 0) {
          entity.damageCooldown = Math.max(0, entity.damageCooldown - dt)
        }
        continue
      }

      entity.update(dt, input)
    }

    resolveCollisions(this)

    for (const [id, entity] of this.#entities) {
      if (!entity.alive) this.#entities.delete(id)
    }
  }
}
