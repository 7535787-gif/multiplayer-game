export interface WorkerBenchmarkResult { mainThreadMs: number; workerRoundTripMs: number; workerWins: boolean; particleCount: number }

/** Compares identical typed-array particle integration on the main thread and in a Worker. */
export async function benchmarkParticleWorker(particleCount = 20_000, dt = 1 / 60): Promise<WorkerBenchmarkResult> {
  const positions = new Float32Array(particleCount * 2)
  const velocities = new Float32Array(particleCount * 2)
  for (let i = 0; i < velocities.length; i++) velocities[i] = ((i % 17) - 8) * 0.1

  const mainPositions = positions.slice()
  const mainStart = performance.now()
  for (let i = 0; i < mainPositions.length; i += 2) {
    mainPositions[i] = (mainPositions[i] ?? 0) + (velocities[i] ?? 0) * dt
    mainPositions[i + 1] = (mainPositions[i + 1] ?? 0) + (velocities[i + 1] ?? 0) * dt
  }
  const mainThreadMs = performance.now() - mainStart

  const worker = new Worker(new URL('./particle.worker.ts', import.meta.url), { type: 'module' })
  const workerPositions = positions.slice()
  const workerStart = performance.now()
  try {
    const workerRoundTripMs = await new Promise<number>((resolve, reject) => {
      worker.onmessage = () => resolve(performance.now() - workerStart)
      worker.onerror = (event) => reject(new Error(event.message))
      worker.postMessage({ positions: workerPositions, velocities, dt }, [workerPositions.buffer])
    })
    return { mainThreadMs, workerRoundTripMs, workerWins: workerRoundTripMs < mainThreadMs, particleCount }
  } finally { worker.terminate() }
}
