import { FIXED_DT, integrateShip } from './ship-sim.js';
/** Replay only inputs not yet acknowledged by the authoritative server. */
export function reconcileShipState({ authoritativeState, pendingInputs, acknowledgedSeq, currentState, arena, dt = FIXED_DT, }) {
    if (!Number.isSafeInteger(acknowledgedSeq) || acknowledgedSeq < -1) {
        throw new RangeError('acknowledgedSeq must be an integer >= -1');
    }
    const remainingInputs = pendingInputs.filter((pending) => pending.seq > acknowledgedSeq);
    let state = { ...authoritativeState };
    for (const pending of remainingInputs) {
        const next = integrateShip(state, pending.input, dt);
        state = arena
            ? { ...next, x: ((next.x % arena.width) + arena.width) % arena.width, y: ((next.y % arena.height) + arena.height) % arena.height }
            : next;
    }
    let dx = state.x - currentState.x;
    let dy = state.y - currentState.y;
    if (arena) {
        if (dx > arena.width / 2)
            dx -= arena.width;
        if (dx < -arena.width / 2)
            dx += arena.width;
        if (dy > arena.height / 2)
            dy -= arena.height;
        if (dy < -arena.height / 2)
            dy += arena.height;
    }
    return {
        state,
        pendingInputs: remainingInputs,
        correctionMagnitude: Math.hypot(dx, dy),
        correctionOffset: { x: -dx, y: -dy },
    };
}
