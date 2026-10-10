function createStars(count) {
  let seed = 73129

  function random() {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }

  return Array.from({ length: count }, () => ({
    x: random(),
    y: random(),
    size: 0.5 + random() * 1.2,
    alpha: 0.2 + random() * 0.45,
    color: random() > 0.8 ? '#9ebacb' : '#d5dce5',
  }))
}

const stars = createStars(230)

// Малює один кадр горизонтального спрайт-листа.
// sprite має містити image, frameWidth, frameHeight і frames.
function drawSpriteFrame(ctx, sprite, frameIndex, x, y, width, height) {
  if (!sprite?.image) return false

  const frameWidth = sprite.frameWidth
  const frameHeight = sprite.frameHeight
  const frames = Math.max(1, sprite.frames || 1)

  if (!frameWidth || !frameHeight) return false

  const image = sprite.image

  if (image.complete && image.naturalWidth === 0) {
    return false
  }

  const frame = ((frameIndex % frames) + frames) % frames

  try {
    ctx.drawImage(
      image,
      frame * frameWidth,
      0,
      frameWidth,
      frameHeight,
      x,
      y,
      width,
      height
    )

    return true
  } catch {
    return false
  }
}

export function drawBackground(ctx, width, height) {
  ctx.save()

  const background = ctx.createLinearGradient(0, 0, width, height)

  background.addColorStop(0, '#111b29')
  background.addColorStop(0.5, '#0d1724')
  background.addColorStop(1, '#101622')

  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  const nebula = ctx.createRadialGradient(
    width * 0.22,
    height * 0.3,
    0,
    width * 0.22,
    height * 0.3,
    Math.max(width, height) * 0.48
  )

  nebula.addColorStop(0, 'rgba(71, 106, 130, 0.13)')
  nebula.addColorStop(1, 'rgba(71, 106, 130, 0)')

  ctx.fillStyle = nebula
  ctx.fillRect(0, 0, width, height)

  const gridSize = 80

  ctx.beginPath()

  for (let x = 0; x <= width; x += gridSize) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
  }

  for (let y = 0; y <= height; y += gridSize) {
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
  }

  ctx.strokeStyle = 'rgba(143, 166, 191, 0.07)'
  ctx.lineWidth = 1
  ctx.stroke()

  for (const star of stars) {
    ctx.globalAlpha = star.alpha
    ctx.fillStyle = star.color

    ctx.beginPath()
    ctx.arc(
      star.x * width,
      star.y * height,
      star.size,
      0,
      Math.PI * 2
    )
    ctx.fill()
  }

  ctx.restore()
}

export function drawShip(ctx, ship, alpha = 1, sprite = null) {
  const t = Math.max(0, Math.min(1, alpha))
  const previous = ship.previousPosition ?? ship.pos

  const x = previous.x + (ship.pos.x - previous.x) * t
  const y = previous.y + (ship.pos.y - previous.y) * t

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ship.angle)

  // Якщо спрайт переданий, використовуємо його замість фігури.
  if (sprite?.image) {
    const size = Math.max((ship.radius || 12) * 3.5, 40)
    const frame = Math.floor(performance.now() / 180)

    if (
      drawSpriteFrame(
        ctx,
        sprite,
        frame,
        -size / 2,
        -size / 2,
        size,
        size
      )
    ) {
      ctx.restore()
      return
    }
  }

  // Резервне малювання корабля фігурами.
  ctx.beginPath()
  ctx.moveTo(23, 0)
  ctx.lineTo(5, -5)
  ctx.lineTo(-3, -15)
  ctx.lineTo(-8, -11)
  ctx.lineTo(-16, -9)
  ctx.lineTo(-11, -2)
  ctx.lineTo(-14, 0)
  ctx.lineTo(-11, 2)
  ctx.lineTo(-16, 9)
  ctx.lineTo(-8, 11)
  ctx.lineTo(-3, 15)
  ctx.lineTo(5, 5)
  ctx.closePath()

  const wingGradient = ctx.createLinearGradient(-16, -12, 20, 12)

  wingGradient.addColorStop(0, '#66788a')
  wingGradient.addColorStop(0.55, '#aab7c2')
  wingGradient.addColorStop(1, '#71869a')

  ctx.fillStyle = wingGradient
  ctx.strokeStyle = '#c0cbd3'
  ctx.lineWidth = 1.4
  ctx.fill()
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(25, 0)
  ctx.lineTo(7, -3.5)
  ctx.lineTo(-9, -3)
  ctx.lineTo(-15, 0)
  ctx.lineTo(-9, 3)
  ctx.lineTo(7, 3.5)
  ctx.closePath()

  ctx.fillStyle = '#d8dfe4'
  ctx.strokeStyle = '#f0e8d9'
  ctx.lineWidth = 1
  ctx.fill()
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(3, -7)
  ctx.lineTo(-7, -9)
  ctx.moveTo(3, 7)
  ctx.lineTo(-7, 9)

  ctx.strokeStyle = '#4f6478'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(11, 0)
  ctx.lineTo(5, -2)
  ctx.lineTo(1, 0)
  ctx.lineTo(5, 2)
  ctx.closePath()

  ctx.fillStyle = '#c58f59'
  ctx.fill()

  ctx.strokeStyle = '#e3bb83'
  ctx.lineWidth = 0.8
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(-14, -2)
  ctx.lineTo(-19, 0)
  ctx.lineTo(-14, 2)

  ctx.strokeStyle = '#c38c5b'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.restore()
}

export function drawBullet(ctx, bullet, sprite = null) {
  ctx.save()

  if (sprite?.image) {
    const size = Math.max((bullet.radius || 3) * 4, 12)
    const frame = Math.floor(performance.now() / 120)

    ctx.translate(bullet.pos.x, bullet.pos.y)

    if (bullet.vel) {
      ctx.rotate(Math.atan2(bullet.vel.y, bullet.vel.x))
    }

    if (
      drawSpriteFrame(
        ctx,
        sprite,
        frame,
        -size / 2,
        -size / 2,
        size,
        size
      )
    ) {
      ctx.restore()
      return
    }
  }

  // Резервне малювання кулі.
  ctx.fillStyle = '#e7bd7c'

  ctx.beginPath()
  ctx.arc(
    bullet.pos.x,
    bullet.pos.y,
    bullet.radius,
    0,
    Math.PI * 2
  )
  ctx.fill()

  ctx.restore()
}

export function drawAsteroid(ctx, asteroid, sprite = null) {
  const radius = asteroid.radius

  ctx.save()
  ctx.translate(asteroid.pos.x, asteroid.pos.y)
  ctx.rotate(asteroid.angle)

  if (sprite?.image) {
    const size = Math.max(radius * 2, 32)
    const frame = Math.max(0, (asteroid.id || 1) - 1)

    if (
      drawSpriteFrame(
        ctx,
        sprite,
        frame,
        -size / 2,
        -size / 2,
        size,
        size
      )
    ) {
      ctx.restore()
      return
    }
  }

  // Резервне малювання астероїда фігурами.
  ctx.beginPath()
  ctx.moveTo(radius * 0.95, radius * 0.12)
  ctx.lineTo(radius * 0.62, radius * 0.78)
  ctx.lineTo(-radius * 0.08, radius * 0.98)
  ctx.lineTo(-radius * 0.72, radius * 0.63)
  ctx.lineTo(-radius, -radius * 0.12)
  ctx.lineTo(-radius * 0.53, -radius * 0.82)
  ctx.lineTo(radius * 0.15, -radius * 0.93)
  ctx.lineTo(radius * 0.73, -radius * 0.58)
  ctx.closePath()

  const rock = ctx.createLinearGradient(
    -radius,
    -radius,
    radius,
    radius
  )

  rock.addColorStop(0, '#718092')
  rock.addColorStop(1, '#354353')

  ctx.fillStyle = rock
  ctx.fill()

  ctx.strokeStyle = '#9aa9b9'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(-radius * 0.35, -radius * 0.3)
  ctx.lineTo(radius * 0.05, -radius * 0.42)
  ctx.lineTo(radius * 0.32, -radius * 0.08)

  ctx.strokeStyle = 'rgba(205, 215, 225, 0.22)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.restore()
}

export function drawExplosion(ctx, explosion) {
  ctx.save()
  ctx.translate(explosion.pos.x, explosion.pos.y)

  for (const particle of explosion.particles) {
    if (particle.life <= 0) continue

    const opacity = Math.max(
      0,
      Math.min(1, particle.life / 0.6)
    )

    ctx.globalAlpha = opacity
    ctx.fillStyle = '#d7a36e'

    ctx.beginPath()
    ctx.arc(
      particle.pos.x,
      particle.pos.y,
      1.5 + opacity,
      0,
      Math.PI * 2
    )
    ctx.fill()
  }

  ctx.restore()
}

export function drawPickup(ctx, pickup) {
  ctx.save()
  ctx.translate(pickup.pos.x, pickup.pos.y)

  ctx.beginPath()
  ctx.arc(0, 0, pickup.radius, 0, Math.PI * 2)

  ctx.fillStyle = 'rgba(112, 165, 144, 0.13)'
  ctx.fill()

  ctx.strokeStyle = '#9bc2a8'
  ctx.lineWidth = 1.6
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(-5, 0)
  ctx.lineTo(5, 0)
  ctx.moveTo(0, -5)
  ctx.lineTo(0, 5)

  ctx.strokeStyle = '#c4e0c9'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.restore()
}