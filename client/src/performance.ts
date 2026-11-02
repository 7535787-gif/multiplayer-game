export interface PerformanceSnapshot {
  frameCount: number
  p50: number
  p95: number
  p99: number
  gcEvents: number
  gcDurationMs: number
  longTasks: number
  measures: Record<string, number>
}

const frameSamples: number[] = []
let gcEvents = 0
let gcDurationMs = 0
let longTasks = 0
const measureTotals = new Map<string, { count: number; duration: number }>()

function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0
}

if (typeof PerformanceObserver !== 'undefined') {
  try { new PerformanceObserver((list) => { for (const entry of list.getEntries()) { gcEvents++; gcDurationMs += entry.duration } }).observe({ type: 'gc', buffered: true }) } catch { /* GC entries are not exposed by every browser. */ }
  try { new PerformanceObserver((list) => { longTasks += list.getEntries().length }).observe({ type: 'longtask', buffered: true }) } catch { /* Long Task API is optional. */ }
}

export function measureLab7(name: string, startMark: string): void {
  performance.mark(`${name}:end`)
  const entry = performance.measure(name, startMark, `${name}:end`)
  const total = measureTotals.get(name) ?? { count: 0, duration: 0 }
  total.count++; total.duration += entry.duration; measureTotals.set(name, total)
  performance.clearMarks(startMark); performance.clearMarks(`${name}:end`); performance.clearMeasures(name)
}

export function recordFrameTime(frameTimeMs: number): void {
  frameSamples.push(frameTimeMs)
  if (frameSamples.length > 120_000) frameSamples.shift()
}

export function getPerformanceSnapshot(): PerformanceSnapshot {
  const measures: Record<string, number> = {}
  for (const name of ['lab7:simulate', 'lab7:render', 'lab7:decode', 'lab7:reconcile']) {
    const total = measureTotals.get(name)
    measures[name] = total && total.count ? total.duration / total.count : 0
  }
  return { frameCount: frameSamples.length, p50: percentile(frameSamples, .5), p95: percentile(frameSamples, .95), p99: percentile(frameSamples, .99), gcEvents, gcDurationMs, longTasks, measures }
}

if (typeof window !== 'undefined') {
  Object.assign(window, { __lab7Performance: getPerformanceSnapshot })
}
