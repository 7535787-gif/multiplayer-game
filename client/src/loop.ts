
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

export function createLoop(
  update: UpdateCallback,
  render: RenderCallback,
): void {
  let lastTime = performance.now()
  let accumulator = 0

  let totalSteps = 0
  let statsTime = performance.now()
  let statsSteps = 0
  let statsFrames = 0

  let stepsPerSecond = 0
  let framesPerSecond = 0

  function frame(currentTime: number): void {
    let frameTime = (currentTime - lastTime) / 1000
    lastTime = currentTime

    frameTime = Math.min(frameTime, 0.1)
    accumulator += frameTime

    while (accumulator >= FIXED_DT) {
      update(FIXED_DT)
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

    const alpha = accumulator / FIXED_DT

    render({
      totalSteps,
      stepsPerSecond,
      framesPerSecond,
      frameTime: frameTime * 1000,
      alpha,
    })

    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}
