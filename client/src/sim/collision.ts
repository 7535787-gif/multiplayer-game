
import { Explosion } from './explosion.js'
import { GAME_EVENTS, emitGameEvent } from './events.js'
import type { World } from './world.js'
import type { Entity } from './entity.js'
import type { Vector2 } from './vector.js'
import type { Ship } from './ship.js'
import type { Bullet } from './bullet.js'
import type { Asteroid } from './asteroid.js'
import type { Pickup } from './pickup.js'

type Collidable = Entity & {
  takeDamage?: (amount: number) => void
  damage?: number
  ownerId?: number | null
  applyTo?: (target: Entity) => void
}

function circleCircle(a: Collidable, b: Collidable): boolean {
  const dx = a.pos.x - b.pos.x
  const dy = a.pos.y - b.pos.y
  const distanceSquared = dx * dx + dy * dy
  const radiusSum = a.radius + b.radius

  return distanceSquared <= radiusSum * radiusSum
}

function segmentCircle(
  start: Vector2,
  end: Vector2,
  circle: Collidable,
  radius: number,
): boolean {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared === 0) {
    const distanceX = start.x - circle.pos.x
    const distanceY = start.y - circle.pos.y
    return distanceX * distanceX + distanceY * distanceY <= radius * radius
  }

  let t =
    ((circle.pos.x - start.x) * dx +
      (circle.pos.y - start.y) * dy) /
    lengthSquared

  t = Math.max(0, Math.min(1, t))

  const closestX = start.x + t * dx
  const closestY = start.y + t * dy
  const distanceX = closestX - circle.pos.x
  const distanceY = closestY - circle.pos.y

  return distanceX * distanceX + distanceY * distanceY <= radius * radius
}

function entitiesCollide(a: Collidable, b: Collidable): boolean {
  if (circleCircle(a, b)) return true

  if (a.kind === 'bullet' && a.previousPosition) {
    return segmentCircle(a.previousPosition, a.pos, b, a.radius + b.radius)
  }

  if (b.kind === 'bullet' && b.previousPosition) {
    return segmentCircle(b.previousPosition, b.pos, a, b.radius + a.radius)
  }

  return false
}

function notifyHit(source: Entity, target: Entity): void {
  emitGameEvent(GAME_EVENTS.HIT, {
    sourceId: source.id,
    sourceKind: source.kind,
    targetId: target.id,
    targetKind: target.kind,
  })
}

function spawnExplosion(world: World, entity: Entity): void {
  world.spawn(new Explosion(entity.pos))

  emitGameEvent(GAME_EVENTS.EXPLODED, {
    entityId: entity.id,
    entityKind: entity.kind,
    x: entity.pos.x,
    y: entity.pos.y,
  })
}

export function resolveCollisions(
  world: World,
  { ignoreEntityIds = new Set<number>() }: { ignoreEntityIds?: Set<number> } = {},
): void {
  const entities: Collidable[] = [...world].map((entity) => entity)

  for (let i = 0; i < entities.length; i++) {
    const a = entities[i]
    if (!a || !a.alive || ignoreEntityIds.has(a.id)) continue

    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j]
      if (!b || !b.alive || ignoreEntityIds.has(b.id)) continue
      if (!entitiesCollide(a, b)) continue

      handleCollision(world, a, b)
    }
  }
}

function handleCollision(world: World, a: Collidable, b: Collidable): void {
  if (a.kind === 'bullet' && b.kind === 'ship' && a.ownerId === b.id) return
  if (a.kind === 'ship' && b.kind === 'bullet' && b.ownerId === a.id) return

  if (a.kind === 'bullet' && b.kind === 'asteroid') {
    a.alive = false
    b.takeDamage?.(a.damage ?? 0)
    notifyHit(a, b)

    if (!b.alive) {
      world.score += 100
      spawnExplosion(world, b)
    }
    return
  }

  if (a.kind === 'asteroid' && b.kind === 'bullet') {
    b.alive = false
    a.takeDamage?.(b.damage ?? 0)
    notifyHit(b, a)

    if (!a.alive) {
      world.score += 100
      spawnExplosion(world, a)
    }
    return
  }

  if (a.kind === 'bullet' && b.kind === 'ship') {
    a.alive = false
    b.takeDamage?.(a.damage ?? 0)
    notifyHit(a, b)
    if (!b.alive) spawnExplosion(world, b)
    return
  }

  if (a.kind === 'ship' && b.kind === 'bullet') {
    b.alive = false
    a.takeDamage?.(b.damage ?? 0)
    notifyHit(b, a)
    if (!a.alive) spawnExplosion(world, a)
    return
  }

  if (a.kind === 'ship' && b.kind === 'asteroid') {
    a.takeDamage?.(10)
    notifyHit(b, a)
    if (!a.alive) spawnExplosion(world, a)
    return
  }

  if (a.kind === 'asteroid' && b.kind === 'ship') {
    b.takeDamage?.(10)
    notifyHit(a, b)
    if (!b.alive) spawnExplosion(world, b)
    return
  }

  if (a.kind === 'ship' && b.kind === 'pickup') {
    b.applyTo?.(a)
    b.alive = false
    return
  }

  if (a.kind === 'pickup' && b.kind === 'ship') {
    a.applyTo?.(b)
    a.alive = false
  }
}
