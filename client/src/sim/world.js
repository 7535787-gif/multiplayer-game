import { resolveCollisions } from './collision.js';
export class World {
    #entities = new Map();
    score = 0;
    spawn(entity) {
        this.#entities.set(entity.id, entity);
        return entity;
    }
    despawn(id) {
        const entity = this.#entities.get(id);
        if (entity)
            entity.alive = false;
    }
    get(id) {
        return this.#entities.get(id);
    }
    *[Symbol.iterator]() {
        yield* this.#entities.values();
    }
    *ofKind(kind) {
        for (const entity of this) {
            if (entity.kind === kind)
                yield entity;
        }
    }
    step(dt, input, { skipEntityId = null } = {}) {
        for (const entity of this) {
            if (!entity.alive)
                continue;
            if (entity.id === skipEntityId) {
                if (typeof entity.damageCooldown === 'number' && entity.damageCooldown > 0) {
                    entity.damageCooldown = Math.max(0, entity.damageCooldown - dt);
                }
                continue;
            }
            entity.update(dt, input);
        }
        resolveCollisions(this);
        for (const [id, entity] of this.#entities) {
            if (!entity.alive)
                this.#entities.delete(id);
        }
    }
}
