
export interface GameCanvas {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  readonly width: number
  readonly height: number
}

export function createCanvas(): GameCanvas {
  const canvas = document.createElement('canvas')
  canvas.id = 'game-canvas'

  const initialContext = canvas.getContext('2d')

  if (!initialContext) {
    throw new Error('Не вдалося створити Canvas 2D context')
  }

  const ctx: CanvasRenderingContext2D = initialContext

  let width = Math.max(1, window.innerWidth)
  let height = Math.max(1, window.innerHeight)

  function resize(): void {
    width = Math.max(1, window.innerWidth)
    height = Math.max(1, window.innerHeight)

    const dpr = window.devicePixelRatio || 1

    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = true
  }

  window.addEventListener('resize', resize)
  resize()

  return {
    canvas,
    ctx,
    get width(): number {
      return width
    },
    get height(): number {
      return height
    },
  }
}
