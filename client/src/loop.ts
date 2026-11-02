import { measureLab7 } from './performance.js'
const FIXED_DT = 1 / 60

export interface LoopStats {
  totalSteps: number
  stepsPerSecond: number
  framesPerSecond: number
  frameTime: number
  alpha: number
}

export type UpdateCallback = (dt: number) => void
export type RenderCallback = (stats: LoopStats) => void

export interface LoopScheduler {
  now(): number
  request(callback: (time: number) => void): number
  cancel(id: number): void
}

const browserScheduler: LoopScheduler = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
}

/** Fixed-step accumulator. Returns a stop function; scheduler injection makes it testable. */
export function createLoop(
  update: UpdateCallback,
  render: RenderCallback,
  scheduler: LoopScheduler = browserScheduler,
): () => void {
  let lastTime = scheduler.now()
  let accumulator = 0
  let totalSteps = 0
  let statsTime = lastTime
  let statsSteps = 0
  let statsFrames = 0
  let stepsPerSecond = 0
  let framesPerSecond = 0
  let stopped = false
  let frameId = 0

  function frame(currentTime: number): void {
    if (stopped) return
    let frameTime = (currentTime - lastTime) / 1000
    lastTime = currentTime
    frameTime = Math.min(Math.max(0, frameTime), 0.1)
    accumulator += frameTime

    while (accumulator >= FIXED_DT) {
      performance.mark('lab7:simulate:start')
      update(FIXED_DT)
      measureLab7('lab7:simulate', 'lab7:simulate:start')
      accumulator -= FIXED_DT
      totalSteps += 1
      statsSteps += 1
    }

    statsFrames += 1
    if (currentTime - statsTime >= 1000) {
      const elapsed = (currentTime - statsTime) / 1000
      stepsPerSecond = statsSteps / elapsed
      framesPerSecond = statsFrames / elapsed
      statsSteps = 0
      statsFrames = 0
      statsTime = currentTime
    }

    performance.mark('lab7:render:start')
    render({ totalSteps, stepsPerSecond, framesPerSecond, frameTime: frameTime * 1000, alpha: accumulator / FIXED_DT })
    measureLab7('lab7:render', 'lab7:render:start')
    frameId = scheduler.request(frame)
  }

  frameId = scheduler.request(frame)
  return () => {
    stopped = true
    scheduler.cancel(frameId)
  }
}
