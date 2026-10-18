import { FIXED_DT, integrateShip } from './ship-sim.js'

/**
 * Rebuild the predicted local state from the latest authoritative snapshot.
 * Inputs at or below acknowledgedSeq have already been consumed by the server;
 * only later inputs are replayed in their original order.
 */
export function reconcileShipState({
  authoritativeState,
  pendingInputs,
  acknowledgedSeq,
  currentState,
  arena,
  dt = FIXED_DT,
}) {
  if (!authoritativeState || !currentState || !Array.isArray(pendingInputs)) {
    throw new TypeError('authoritativeState, currentState and pendingInputs are required')
  }
  if (!Number.isSafeInteger(acknowledgedSeq) || acknowledgedSeq < -1) {
    throw new RangeError('acknowledgedSeq must be an integer >= -1')
  }

  const remainingInputs = pendingInputs.filter((pending) => pending.seq > acknowledgedSeq)
  let state = { ...authoritativeState }

  for (const pending of remainingInputs) {
    state = integrateShip(state, pending.input, dt)
    if (arena) {
      state.x = ((state.x % arena.width) + arena.width) % arena.width
      state.y = ((state.y % arena.height) + arena.height) % arena.height
    }
  }

  let dx = state.x - currentState.x
  let dy = state.y - currentState.y
  if (arena) {
    if (dx > arena.width / 2) dx -= arena.width
    if (dx < -arena.width / 2) dx += arena.width
    if (dy > arena.height / 2) dy -= arena.height
    if (dy < -arena.height / 2) dy += arena.height
  }

  return {
    state,
    pendingInputs: remainingInputs,
    correctionMagnitude: Math.hypot(dx, dy),
    correctionOffset: { x: -dx, y: -dy },
  }
}
