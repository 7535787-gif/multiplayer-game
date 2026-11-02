// Node-side baseline for typed-array particle integration. Browser Worker timing is exposed by
// client/src/workers/particle-worker-benchmark.ts and must be run in the browser for a fair comparison.
const count = Number(process.env.PARTICLES ?? 20000)
const positions = new Float32Array(count * 2)
const velocities = new Float32Array(count * 2)
for (let i = 0; i < velocities.length; i++) velocities[i] = ((i % 17) - 8) * 0.1
const start = performance.now()
for (let i = 0; i < positions.length; i += 2) {
  positions[i] = (positions[i] ?? 0) + (velocities[i] ?? 0) / 60
  positions[i + 1] = (positions[i + 1] ?? 0) + (velocities[i + 1] ?? 0) / 60
}
console.log(JSON.stringify({ mode: 'main-thread-baseline', particles: count, elapsedMs: Number((performance.now() - start).toFixed(3)) }))
