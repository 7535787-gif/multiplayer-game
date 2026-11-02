import { describe, expect, it } from 'vitest'
import { Entity } from '../entity.js'
import { Vector2 } from '../vector.js'
import { World } from '../world.js'

function createWorld(): World {
  const world = new World()
  world.spawn(new Entity({ pos: new Vector2(10, 20), vel: new Vector2(3, -2), radius: 1 }))
  world.spawn(new Entity({ pos: new Vector2(100, 50), vel: new Vector2(-1, 4), radius: 1 }))
  return world
}

describe('World.step deterministic simulation', () => {
  it('produces deeply equal states for two worlds stepped identically', () => {
    const first = createWorld()
    const second = createWorld()
    for (let i = 0; i < 120; i++) { first.step(1 / 60); second.step(1 / 60) }
    const state = (world: World) => [...world].map((entity) => ({ x: entity.pos.x, y: entity.pos.y, vx: entity.vel.x, vy: entity.vel.y, alive: entity.alive }))
    expect(state(first)).toEqual(state(second))
  })

  it('removes despawned entities after a step', () => {
    const world = createWorld()
    const first = [...world][0]
    expect(first).toBeDefined()
    if (!first) return
    world.despawn(first.id)
    world.step(1 / 60)
    expect(world.get(first.id)).toBeUndefined()
  })
})
