import { Explosion } from './explosion.js'

export function circleCircle(a, b) {
  const dx =
    a.pos.x - b.pos.x

  const dy =
    a.pos.y - b.pos.y

  const distanceSquared =
    dx * dx + dy * dy

  const radiusSum =
    a.radius + b.radius

  return (
    distanceSquared <=
    radiusSum * radiusSum
  )
}

function segmentCircle(
  start,
  end,
  circle,
  radius
) {
  const dx =
    end.x - start.x

  const dy =
    end.y - start.y

  const lengthSquared =
    dx * dx + dy * dy

  if (lengthSquared === 0) {
    const distanceX =
      start.x - circle.pos.x

    const distanceY =
      start.y - circle.pos.y

    return (
      distanceX * distanceX +
      distanceY * distanceY <=
      radius * radius
    )
  }

  let t =
    (
      (circle.pos.x - start.x) * dx +
      (circle.pos.y - start.y) * dy
    ) / lengthSquared

  t = Math.max(
    0,
    Math.min(1, t)
  )

  const closestX =
    start.x + t * dx

  const closestY =
    start.y + t * dy

  const distanceX =
    closestX - circle.pos.x

  const distanceY =
    closestY - circle.pos.y

  return (
    distanceX * distanceX +
    distanceY * distanceY <=
    radius * radius
  )
}

function entitiesCollide(a, b) {
  if (circleCircle(a, b)) {
    return true
  }

  if (
    a.kind === 'bullet' &&
    a.previousPosition
  ) {
    return segmentCircle(
      a.previousPosition,
      a.pos,
      b,
      a.radius + b.radius
    )
  }

  if (
    b.kind === 'bullet' &&
    b.previousPosition
  ) {
    return segmentCircle(
      b.previousPosition,
      b.pos,
      a,
      b.radius + a.radius
    )
  }

  return false
}

export function resolveCollisions(world) {
  const entities = [...world]

  for (
    let i = 0;
    i < entities.length;
    i++
  ) {
    const a = entities[i]

    if (!a.alive) {
      continue
    }

    for (
      let j = i + 1;
      j < entities.length;
      j++
    ) {
      const b = entities[j]

      if (!b.alive) {
        continue
      }

      if (!entitiesCollide(a, b)) {
        continue
      }

      handleCollision(
        world,
        a,
        b
      )
    }
  }
}

function handleCollision(
  world,
  a,
  b
) {
  // Куля → астероїд
  if (
    a.kind === 'bullet' &&
    b.kind === 'asteroid'
  ) {
    a.alive = false

    b.takeDamage(a.damage)

    if (!b.alive) {
      world.score += 100

      world.spawn(
        new Explosion(b.pos)
      )
    }

    return
  }

  // Астероїд → куля
  if (
    a.kind === 'asteroid' &&
    b.kind === 'bullet'
  ) {
    b.alive = false

    a.takeDamage(b.damage)

    if (!a.alive) {
      world.score += 100

      world.spawn(
        new Explosion(a.pos)
      )
    }

    return
  }

  // Куля → корабель
  if (
    a.kind === 'bullet' &&
    b.kind === 'ship'
  ) {
    a.alive = false

    b.takeDamage(a.damage)

    if (!b.alive) {
      world.spawn(
        new Explosion(b.pos)
      )
    }

    return
  }

  // Корабель → куля
  if (
    a.kind === 'ship' &&
    b.kind === 'bullet'
  ) {
    b.alive = false

    a.takeDamage(b.damage)

    if (!a.alive) {
      world.spawn(
        new Explosion(a.pos)
      )
    }

    return
  }

  // Корабель → астероїд
  if (
    a.kind === 'ship' &&
    b.kind === 'asteroid'
  ) {
    a.takeDamage(10)

    if (a.alive) {
      a.resetAfterCollision()
    } else {
      world.spawn(
        new Explosion(a.pos)
      )
    }

    return
  }

  // Астероїд → корабель
  if (
    a.kind === 'asteroid' &&
    b.kind === 'ship'
  ) {
    b.takeDamage(10)

    if (b.alive) {
      b.resetAfterCollision()
    } else {
      world.spawn(
        new Explosion(b.pos)
      )
    }

    return
  }

  // Корабель → pickup
  if (
    a.kind === 'ship' &&
    b.kind === 'pickup'
  ) {
    b.applyTo(a)

    b.alive = false

    return
  }

  // Pickup → корабель
  if (
    a.kind === 'pickup' &&
    b.kind === 'ship'
  ) {
    a.applyTo(b)

    a.alive = false
  }
}