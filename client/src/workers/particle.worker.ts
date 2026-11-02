/// <reference lib="webworker" />

interface ParticleBatch { positions: Float32Array; velocities: Float32Array; dt: number }

self.onmessage = (event: MessageEvent<ParticleBatch>) => {
  const { positions, velocities, dt } = event.data
  for (let i = 0; i < positions.length; i += 2) {
    positions[i] = (positions[i] ?? 0) + (velocities[i] ?? 0) * dt
    positions[i + 1] = (positions[i + 1] ?? 0) + (velocities[i + 1] ?? 0) * dt
  }
  self.postMessage({ positions }, [positions.buffer])
}

export {}
