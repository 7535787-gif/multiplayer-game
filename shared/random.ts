/** Deterministic seeded pseudo-random generator. Keep its arithmetic unchanged. */
export type RandomSource = () => number

export function createRandom(seed: number): RandomSource {
  let state: number = seed >>> 0

  return function random(): number {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 0x100000000
  }
}
