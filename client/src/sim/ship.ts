
import { Entity } from './entity.js'
import { Vector2 } from './vector.js'
import { Bullet } from './bullet.js'
import { createHoming } from './homing.js'
import { emitGameEvent } from './events.js'

interface KeyboardInput {
  isDown(key: string): boolean
}

interface HomingTarget extends Entity {}

interface SpawnWorld {
  spawn(entity: Entity): void
}

export class Ship extends Entity {
  #hp = 100

  acceleration = 220
  rotationSpeed = 2.1
  maxSpeed = 250
  braking = 330
  reverseAcceleration = 90
  drag = 0.9
  thrustDrag = 0.15
  damageCooldown = 0
  spawnPosition: Vector2

  constructor(x: number, y: number) {
    super({
      pos: new Vector2(x, y),
      vel: new Vector2(0, 0),
      angle: 0,
      radius: 15,
      kind: 'ship',
    })

    this.previousPosition = this.pos
    this.spawnPosition = new Vector2(x, y)
  }

  get hp(): number {
    return this.#hp
  }

  takeDamage(amount: number): void {
    if (this.damageCooldown > 0) return

    this.#hp -= amount
    this.damageCooldown = 0.5

    if (this.#hp <= 0) {
      this.#hp = 0
      this.alive = false
    }
  }

  heal(amount: number): void {
    this.#hp = Math.min(100, this.#hp + amount)
  }

  resetAfterCollision(): void {
    this.previousPosition = new Vector2(this.pos.x, this.pos.y)
    this.vel = new Vector2(0, 0)
  }

  update(dt: number, input: KeyboardInput): void {
    this.previousPosition = this.pos

    if (this.damageCooldown > 0) {
      this.damageCooldown -= dt
    }

    if (input.isDown('ArrowLeft')) {
      this.angle -= this.rotationSpeed * dt
    }

    if (input.isDown('ArrowRight')) {
      this.angle += this.rotationSpeed * dt
    }

    if (input.isDown('ArrowUp')) {
      const direction = Vector2.fromAngle(this.angle)
      this.vel = this.vel.add(direction.scale(this.acceleration * dt))
    }

    if (input.isDown('ArrowDown')) {
      const speed = this.vel.length()

      if (speed > 1) {
        const newSpeed = Math.max(0, speed - this.braking * dt)
        this.vel = this.vel.normalize().scale(newSpeed)
      } else {
        const direction = Vector2.fromAngle(this.angle)
        this.vel = this.vel.sub(
          direction.scale(this.reverseAcceleration * dt),
        )
      }
    }

    const drag = input.isDown('ArrowUp') ? this.thrustDrag : this.drag
    this.vel = this.vel.scale(Math.exp(-drag * dt))

    const speed = this.vel.length()
    if (speed > this.maxSpeed) {
      this.vel = this.vel.normalize().scale(this.maxSpeed)
    }

    this.pos = this.pos.add(this.vel.scale(dt))
  }

  fire(world: SpawnWorld): Bullet {
    const direction = Vector2.fromAngle(this.angle)
    const bulletPosition = this.pos.add(
      direction.scale(this.radius + 5),
    )

    const bullet = new Bullet(
      bulletPosition,
      this.angle,
      this.vel,
      null,
      this.id,
    )

    world.spawn(bullet)

    emitGameEvent('fired', {
      shipId: this.id,
      bulletId: bullet.id,
      homing: false,
    })

    return bullet
  }

  fireHoming(world: SpawnWorld, target: HomingTarget): Bullet {
    const direction = Vector2.fromAngle(this.angle)
    const bulletPosition = this.pos.add(
      direction.scale(this.radius + 5),
    )

    const homing = createHoming(target)

    const bullet = new Bullet(
      bulletPosition,
      this.angle,
      this.vel,
      homing,
      this.id,
    )

    world.spawn(bullet)

    emitGameEvent('fired', {
      shipId: this.id,
      bulletId: bullet.id,
      homing: true,
      targetId: target.id,
    })

    return bullet
  }
}
