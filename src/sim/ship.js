import { Entity } from './entity.js'
import { Vector2 } from './vector.js'
import { Bullet } from './bullet.js'
import { createHoming } from './homing.js'

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

    this.acceleration = 280
    this.rotationSpeed = 2.5
    this.maxSpeed = 280
    this.braking = 450
    this.reverseAcceleration = 120

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

    if (input.isDown('ArrowLeft')) {
      this.angle -=
        this.rotationSpeed * dt
    }

    if (input.isDown('ArrowRight')) {
      this.angle +=
        this.rotationSpeed * dt
    }

    if (input.isDown('ArrowUp')) {
      const direction =
        Vector2.fromAngle(this.angle)

      this.vel = this.vel.add(
        direction.scale(
          this.acceleration * dt
        )
      )
    }

    if (input.isDown('ArrowDown')) {
      const speed = this.vel.length()

      if (speed > 1) {
        const newSpeed =
          Math.max(
            0,
            speed - this.braking * dt
          )

        this.vel =
          this.vel
            .normalize()
            .scale(newSpeed)
      } else {
        const direction =
          Vector2.fromAngle(this.angle)

        this.vel =
          this.vel.sub(
            direction.scale(
              this.reverseAcceleration * dt
            )
          )
      }
    }

    const speed = this.vel.length()

    if (speed > this.maxSpeed) {
      this.vel =
        this.vel
          .normalize()
          .scale(this.maxSpeed)
    }

    this.pos = this.pos.add(
      this.vel.scale(dt)
    )
  }

  fire(world) {
    const direction =
      Vector2.fromAngle(this.angle)

    const bulletPosition =
      this.pos.add(
        direction.scale(
          this.radius + 5
        )
      )

    const bullet = new Bullet(
      bulletPosition,
      this.angle,
      this.vel
    )

    world.spawn(bullet)

    return bullet
  }

  fireHoming(world, target) {
    const direction =
      Vector2.fromAngle(this.angle)

    const bulletPosition =
      this.pos.add(
        direction.scale(
          this.radius + 5
        )
      )

    const homing =
      createHoming(target)

    const bullet = new Bullet(
      bulletPosition,
      this.angle,
      this.vel,
      homing
    )

    world.spawn(bullet)

    return bullet
  }
}