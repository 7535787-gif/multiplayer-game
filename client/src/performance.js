const samples = []
let gcEvents = 0, gcDurationMs = 0, longTasks = 0
const totals = new Map()
const percentile = (values, p) => { if (!values.length) return 0; const sorted = [...values].sort((a,b)=>a-b); return sorted[Math.min(sorted.length-1, Math.ceil(sorted.length*p)-1)] ?? 0 }
if (typeof PerformanceObserver !== 'undefined') {
  try { new PerformanceObserver((list) => { for (const entry of list.getEntries()) { gcEvents++; gcDurationMs += entry.duration } }).observe({ type: 'gc', buffered: true }) } catch { /* optional */ }
  try { new PerformanceObserver((list) => { longTasks += list.getEntries().length }).observe({ type: 'longtask', buffered: true }) } catch { /* optional */ }
}
export function measureLab7(name, startMark) {
  performance.mark(`${name}:end`)
  const entry = performance.measure(name, startMark, `${name}:end`)
  const total = totals.get(name) ?? { count: 0, duration: 0 }
  total.count++; total.duration += entry.duration; totals.set(name, total)
  performance.clearMarks(startMark); performance.clearMarks(`${name}:end`); performance.clearMeasures(name)
}
export function recordFrameTime(value) { samples.push(value); if (samples.length > 120000) samples.shift() }
export function getPerformanceSnapshot() {
  const measures = {}
  for (const name of ['lab7:simulate','lab7:render','lab7:decode','lab7:reconcile']) { const total = totals.get(name); measures[name] = total?.count ? total.duration / total.count : 0 }
  return { frameCount: samples.length, p50: percentile(samples,.5), p95: percentile(samples,.95), p99: percentile(samples,.99), gcEvents, gcDurationMs, longTasks, measures }
}
if (typeof window !== 'undefined') Object.assign(window, { __lab7Performance: getPerformanceSnapshot })
