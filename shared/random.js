
export function createRandom(seed) {
    let state = seed >>> 0
  
    return function random() {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0
      return state / 0x100000000
    }
  }
  