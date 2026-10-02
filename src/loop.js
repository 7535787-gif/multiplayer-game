const FIXED_DT = 1 / 60

export function createLoop(update, render) {
  let lastTime = performance.now()
  let accumulator = 0

  let totalSteps = 0

  let statsTime = performance.now()
  let statsSteps = 0
  let statsFrames = 0

  let stepsPerSecond = 0
  let framesPerSecond = 0

  function frame(currentTime) {
    let frameTime = (currentTime - lastTime) / 1000

    lastTime = currentTime

    // Захист від дуже великої паузи
    frameTime = Math.min(frameTime, 0.1)

    accumulator += frameTime

    // Фіксований крок симуляції — 60 разів на секунду
    while (accumulator >= FIXED_DT) {
      update(FIXED_DT)

      accumulator -= FIXED_DT

      totalSteps += 1
      statsSteps += 1
    }

    statsFrames += 1

    // Оновлення статистики раз на секунду
    if (currentTime - statsTime >= 1000) {
      const elapsed = (currentTime - statsTime) / 1000

      stepsPerSecond = statsSteps / elapsed
      framesPerSecond = statsFrames / elapsed

      statsSteps = 0
      statsFrames = 0
      statsTime = currentTime
    }

    // Інтерполяція
    const alpha = accumulator / FIXED_DT

    render({
      totalSteps,
      stepsPerSecond,
      framesPerSecond,

      // Час між кадрами в мілісекундах
      frameTime: frameTime * 1000,

      alpha,
    })

    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}