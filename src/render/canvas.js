export function createCanvas() {
  const canvas = document.createElement('canvas')
  canvas.id = 'game-canvas'

  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Не вдалося створити Canvas 2D context')
  }

  let width = Math.max(1, window.innerWidth)
  let height = Math.max(1, window.innerHeight)

  function resize() {
    width = Math.max(1, window.innerWidth)
    height = Math.max(1, window.innerHeight)

    const dpr = window.devicePixelRatio || 1

    // Фізичний розмір Canvas з урахуванням DPR.
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)

    // Уся подальша графіка працює в логічних пікселях.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = true
  }

  window.addEventListener('resize', resize)
  resize()

  return {
    canvas,
    ctx,

    // Передаємо логічні розміри для фізики та малювання.
    get width() {
      return width
    },

    get height() {
      return height
    },
  }
}