export function drawShip(ctx, ship, alpha) {
  const renderX =
    ship.previousPosition.x +
    (ship.pos.x - ship.previousPosition.x) * alpha

  const renderY =
    ship.previousPosition.y +
    (ship.pos.y - ship.previousPosition.y) * alpha

  ctx.save()

  ctx.translate(renderX, renderY)
  ctx.rotate(ship.angle)

  ctx.beginPath()

  ctx.moveTo(22, 0)
  ctx.lineTo(-14, -10)
  ctx.lineTo(-8, 0)
  ctx.lineTo(-14, 10)
  ctx.closePath()

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2

  ctx.stroke()

  ctx.restore()
}

export function drawBullet(ctx, bullet) {
  ctx.save()

  ctx.beginPath()

  ctx.arc(
    bullet.pos.x,
    bullet.pos.y,
    bullet.radius,
    0,
    Math.PI * 2
  )

  ctx.fillStyle = '#ffffff'

  ctx.fill()

  ctx.restore()
}

export function drawAsteroid(ctx, asteroid) {
  ctx.save()

  ctx.translate(
    asteroid.pos.x,
    asteroid.pos.y
  )

  ctx.rotate(asteroid.angle)

  ctx.beginPath()

  ctx.moveTo(
    asteroid.radius,
    0
  )

  ctx.lineTo(
    asteroid.radius * 0.4,
    asteroid.radius * 0.8
  )

  ctx.lineTo(
    -asteroid.radius * 0.7,
    asteroid.radius * 0.6
  )

  ctx.lineTo(
    -asteroid.radius,
    0
  )

  ctx.lineTo(
    -asteroid.radius * 0.5,
    -asteroid.radius * 0.8
  )

  ctx.lineTo(
    asteroid.radius * 0.5,
    -asteroid.radius * 0.7
  )

  ctx.closePath()

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2

  ctx.stroke()

  ctx.restore()
}

export function drawExplosion(ctx, explosion) {
  ctx.save()

  ctx.translate(
    explosion.pos.x,
    explosion.pos.y
  )

  for (const particle of explosion.particles) {
    if (particle.life <= 0) {
      continue
    }

    ctx.beginPath()

    ctx.arc(
      particle.pos.x,
      particle.pos.y,
      3,
      0,
      Math.PI * 2
    )

    ctx.fillStyle = '#ffffff'

    ctx.fill()
  }

  ctx.restore()
}

export function drawPickup(ctx, pickup) {
  ctx.save()

  ctx.translate(
    pickup.pos.x,
    pickup.pos.y
  )

  ctx.beginPath()

  ctx.arc(
    0,
    0,
    pickup.radius,
    0,
    Math.PI * 2
  )

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2

  ctx.stroke()

  ctx.beginPath()

  ctx.moveTo(-6, 0)
  ctx.lineTo(6, 0)

  ctx.moveTo(0, -6)
  ctx.lineTo(0, 6)

  ctx.stroke()

  ctx.restore()
}