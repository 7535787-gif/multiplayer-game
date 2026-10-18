
import test from 'node:test'
import assert from 'node:assert/strict'

import { FIXED_DT, integrateShip } from '../shared/ship-sim.js'
import { createRandom } from '../shared/random.js'

import { Room } from '../server/src/room.js'

import { wrapPosition } from '../client/src/sim/arena.js'
import { Vector2 } from '../client/src/sim/vector.js'


test('shared simulation imports in Node without browser APIs', () => {
  assert.equal(typeof integrateShip, 'function')
  assert.equal(typeof FIXED_DT, 'number')
  assert.equal(typeof document, 'undefined')
})

test('same initial state and inputs produce the same result', () => {
  const initialState = {
    x: 100,
    y: 200,
    vx: 0,
    vy: 0,
    angle: 0,
  }

  const inputs = [
    { thrust: true, left: false, right: false, brake: false },
    { thrust: true, left: true, right: false, brake: false },
    { thrust: false, left: false, right: true, brake: false },
    { thrust: false, left: false, right: false, brake: true },
  ]

  function simulate() {
    let state = { ...initialState }

    for (let i = 0; i < 120; i++) {
      state = integrateShip(state, inputs[i % inputs.length], FIXED_DT)
    }

    return state
  }

  assert.deepEqual(simulate(), simulate())
})

test('seeded random generator produces the same sequence', () => {
  const randomA = createRandom(12345)
  const randomB = createRandom(12345)

  const sequenceA = Array.from({ length: 10 }, () => randomA())
  const sequenceB = Array.from({ length: 10 }, () => randomB())

  assert.deepEqual(sequenceA, sequenceB)
})

test('simulation rejects an invalid time step', () => {
  const state = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 }

  assert.throws(
    () => integrateShip(state, {}, 0),
    RangeError,
  )
})


test('server acknowledges input only after processing it', () => {
  const room = new Room({
    id: 'test-room',
    name: 'Test room',
    arena: { width: 800, height: 600 },
  })

  const player = {
    id: 'player-1',
    name: 'Test player',
  }

  assert.equal(room.join(player), true)

  assert.equal(
    room.setInput('player-1', {
      seq: 1,
      left: false,
      right: false,
      thrust: true,
      brake: false,
    }),
    true,
  )

  // До кроку симуляції input ще не підтверджений.
  assert.equal(room.snapshot().players[0].lastProcessedSeq, -1)

  room.simulateStep()

  // Після кроку сервер підтверджує оброблений input.
  assert.equal(room.snapshot().players[0].lastProcessedSeq, 1)
})

test('server rejects invalid input fields', () => {
  const room = new Room({
    id: 'test-room',
    name: 'Test room',
    arena: { width: 800, height: 600 },
  })

  room.join({ id: 'player-1', name: 'Test player' })

  assert.equal(
    room.setInput('player-1', {
      seq: 1,
      left: 'yes',
      right: false,
      thrust: true,
      brake: false,
    }),
    false,
  )
})

test('ship wraps around arena boundaries', () => {
  const ship = {
    pos: new Vector2(-10, 610),
    previousPosition: new Vector2(0, 0),
  }

  wrapPosition(ship, 800, 600)

  assert.equal(ship.pos.x, 790)
  assert.equal(ship.pos.y, 10)
  assert.notEqual(ship.previousPosition, ship.pos)
  assert.equal(ship.previousPosition.x, 790)
  assert.equal(ship.previousPosition.y, 10)
})

