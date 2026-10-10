import { Entity } from './entity.js'
import { Vector2 } from './vector.js'
import { Bullet } from './bullet.js'
import { createHoming } from './homing.js'
import { emitGameEvent } from './events.js'

export class Ship extends Entity {
  #hp = 100

  constructor(x, y) {
    super({
      pos: new Vector2(x, y),
      vel: new Vector2(0, 0),
      angle: 0,
      radius: 15,
      kind: 'ship',
    })

    this.previousPosition = this.pos
    this.spawnPosition = new Vector2(x, y)

    // Плавніше прискорення та поворот.
    this.acceleration = 220
    this.rotationSpeed = 2.1
    this.maxSpeed = 250

    // Гальмування та рух назад.
    this.braking = 330
    this.reverseAcceleration = 90

    // Опір руху.
    this.drag = 0.9
    this.thrustDrag = 0.15

    this.damageCooldown = 0
  }

  get hp() {
    return this.#hp
  }

  takeDamage(amount) {
    if (this.damageCooldown > 0) {
      return
    }

    this.#hp -= amount
    this.damageCooldown = 0.5

    if (this.#hp <= 0) {
      this.#hp = 0
      this.alive = false
    }
  }

  heal(amount) {
    this.#hp = Math.min(
      100,
      this.#hp + amount
    )
  }

  resetAfterCollision() {
    this.pos = new Vector2(
      this.spawnPosition.x,
      this.spawnPosition.y
    )

    this.previousPosition = this.pos
    this.vel = new Vector2(0, 0)
  }

  update(dt, input) {
    this.previousPosition = this.pos

    if (this.damageCooldown > 0) {
      this.damageCooldown -= dt
    }

    // Поворот корабля.
    if (input.isDown('ArrowLeft')) {
      this.angle -= this.rotationSpeed * dt
    }

    if (input.isDown('ArrowRight')) {
      this.angle += this.rotationSpeed * dt
    }

    // Прискорення в напрямку носа корабля.
    if (input.isDown('ArrowUp')) {
      const direction = Vector2.fromAngle(this.angle)

      this.vel = this.vel.add(
        direction.scale(this.acceleration * dt)
      )
    }

    // Плавне гальмування або рух назад.
    if (input.isDown('ArrowDown')) {
      const speed = this.vel.length()

      if (speed > 1) {
        const newSpeed = Math.max(
          0,
          speed - this.braking * dt
        )

        this.vel = this.vel
          .normalize()
          .scale(newSpeed)
      } else {
        const direction = Vector2.fromAngle(this.angle)

        this.vel = this.vel.sub(
          direction.scale(
            this.reverseAcceleration * dt
          )
        )
      }
    }

    // Без тяги корабель поступово втрачає швидкість.
    const drag = input.isDown('ArrowUp')
      ? this.thrustDrag
      : this.drag

    this.vel = this.vel.scale(
      Math.exp(-drag * dt)
    )

    // Обмеження максимальної швидкості.
    const speed = this.vel.length()

    if (speed > this.maxSpeed) {
      this.vel = this.vel
        .normalize()
        .scale(this.maxSpeed)
    }

    // Оновлення позиції.
    this.pos = this.pos.add(
      this.vel.scale(dt)
    )
  }

  fire(world) {
    const direction = Vector2.fromAngle(this.angle)

    const bulletPosition = this.pos.add(
      direction.scale(this.radius + 5)
    )

    const bullet = new Bullet(
      bulletPosition,
      this.angle,
      this.vel,
      null,
      this.id
    )

    world.spawn(bullet)

    // Повідомляємо гру про звичайний постріл.
    emitGameEvent('fired', {
      shipId: this.id,
      bulletId: bullet.id,
      homing: false,
    })

    return bullet
  }

  fireHoming(world, target) {
    const direction = Vector2.fromAngle(this.angle)

    const bulletPosition = this.pos.add(
      direction.scale(this.radius + 5)
    )

    const homing = createHoming(target)

    const bullet = new Bullet(
      bulletPosition,
      this.angle,
      this.vel,
      homing,
      this.id
    )

    world.spawn(bullet)

    // Повідомляємо гру про самонавідний постріл.
    emitGameEvent('fired', {
      shipId: this.id,
      bulletId: bullet.id,
      homing: true,
      targetId: target.id,
    })

    return bullet
  }
}