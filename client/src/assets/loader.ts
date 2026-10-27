import { z } from 'zod'

export class HttpError extends Error {
  readonly status: number
  readonly url: string

  constructor(status: number, url: string) {
    super(`HTTP ${status}: ${url}`)
    this.name = 'HttpError'
    this.status = status
    this.url = url
  }
}

export class InvalidJsonError extends Error {
  readonly url: string

  constructor(url: string, cause: unknown) {
    super(`Некоректний JSON: ${url}`, { cause })
    this.name = 'InvalidJsonError'
    this.url = url
  }
}

export interface RetryOptions {
  attempts?: number
  baseMs?: number
  signal?: AbortSignal
}

export interface SpriteDefinition {
  url: string
  frameWidth: number
  frameHeight: number
  frames: number
}

export interface AssetManifest {
  sprites?: Record<string, SpriteDefinition>
  sounds?: Record<string, string>
  arena?: { width: number; height: number; name?: string }
}

export const AssetManifestSchema = z.object({
  sprites: z.record(z.string(), z.object({
    url: z.string(),
    frameWidth: z.number(),
    frameHeight: z.number(),
    frames: z.number(),
  })).optional(),
  sounds: z.record(z.string(), z.string()).optional(),
  arena: z.object({
    width: z.number(),
    height: z.number(),
    name: z.string().optional(),
  }).optional(),
})

export interface LoadProgress {
  loaded: number
  total: number
  ratio: number
  item: string | null
  category?: 'sprite' | 'sound'
  status: 'start' | 'loaded' | 'error'
  error?: unknown
}

export interface LoadedSprite {
  image: HTMLImageElement
  frameWidth: number
  frameHeight: number
  frames: number
}

export interface LoadedAssets {
  sprites: Record<string, LoadedSprite>
  sounds: Record<string, AudioBuffer>
  arena?: AssetManifest['arena']
}

export interface LoadAllOptions {
  onProgress?: (progress: LoadProgress) => void
  signal?: AbortSignal
  audioContext?: AudioContext | null
}

function abortError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) return signal.reason
  return new DOMException('Операцію скасовано', 'AbortError')
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal)
}

function shouldRetry(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return false
  if (error instanceof Error && (error.name === 'AbortError' || error instanceof InvalidJsonError)) return false
  if (error instanceof HttpError) return error.status >= 500
  return true
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    throwIfAborted(signal)
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    const cleanup = (): void => signal?.removeEventListener('abort', onAbort)
    const onAbort = (): void => {
      clearTimeout(timer)
      cleanup()
      reject(abortError(signal))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function withRetry<T>(task: (signal?: AbortSignal) => Promise<T>, {
  attempts = 3,
  baseMs = 250,
  signal,
}: RetryOptions = {}): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    throwIfAborted(signal)
    try {
      return await task(signal)
    } catch (error: unknown) {
      const lastAttempt = attempt === attempts - 1
      if (lastAttempt || !shouldRetry(error, signal)) throw error
      const backoff = baseMs * 2 ** attempt
      const jitter = 0.75 + Math.random() * 0.5
      await delay(backoff * jitter, signal)
    }
  }
  throw new Error('Не вдалося завантажити ресурс')
}

export async function fetchJson(url: string, { signal }: Pick<RetryOptions, 'signal'> = {}): Promise<unknown> {
  throwIfAborted(signal)
  const response = await fetch(url, { signal })
  if (!response.ok) throw new HttpError(response.status, url)
  try {
    const data: unknown = await response.json()
    return data
  } catch (error: unknown) {
    throwIfAborted(signal)
    throw new InvalidJsonError(url, error)
  }
}

export function loadJson<T>(url: string, schema: z.ZodType<T>, { signal, attempts = 3, baseMs = 250 }: RetryOptions = {}): Promise<T> {
  return withRetry(async (currentSignal) => {
    const data = await fetchJson(url, { signal: currentSignal })
    return schema.parse(data)
  }, { signal, attempts, baseMs })
}

export function loadImage(url: string, { signal, attempts = 3, baseMs = 250 }: RetryOptions = {}): Promise<HTMLImageElement> {
  return withRetry(async (currentSignal) => {
    const response = await fetch(url, { signal: currentSignal })
    if (!response.ok) throw new HttpError(response.status, url)
    const blob = await response.blob()
    throwIfAborted(currentSignal)
    const objectUrl = URL.createObjectURL(blob)
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        const cleanup = (): void => {
          image.removeEventListener('load', onLoad)
          image.removeEventListener('error', onError)
          currentSignal?.removeEventListener('abort', onAbort)
        }
        const onLoad = (): void => { cleanup(); resolve(image) }
        const onError = (): void => { cleanup(); reject(new Error(`Не вдалося завантажити зображення: ${url}`)) }
        const onAbort = (): void => { cleanup(); reject(abortError(currentSignal)) }
        image.addEventListener('load', onLoad, { once: true })
        image.addEventListener('error', onError, { once: true })
        currentSignal?.addEventListener('abort', onAbort, { once: true })
        image.src = objectUrl
      })
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }, { signal, attempts, baseMs })
}

export function loadAudio(audioContext: AudioContext | null | undefined, url: string, { signal, attempts = 3, baseMs = 250 }: RetryOptions = {}): Promise<AudioBuffer> {
  if (!audioContext) return Promise.reject(new Error('AudioContext не створено'))
  return withRetry(async (currentSignal) => {
    const response = await fetch(url, { signal: currentSignal })
    if (!response.ok) throw new HttpError(response.status, url)
    const data = await response.arrayBuffer()
    throwIfAborted(currentSignal)
    const buffer = await audioContext.decodeAudioData(data)
    throwIfAborted(currentSignal)
    return buffer
  }, { signal, attempts, baseMs })
}

export async function loadAll(manifest: AssetManifest, {
  onProgress = () => undefined,
  signal,
  audioContext,
}: LoadAllOptions = {}): Promise<LoadedAssets> {
  const spriteEntries = Object.entries(manifest.sprites ?? {})
  const soundEntries = Object.entries(manifest.sounds ?? {})
  if (soundEntries.length > 0 && !audioContext) throw new Error('Перед завантаженням звуків потрібно створити AudioContext')

  type SpriteTask = { category: 'sprite'; key: string; definition: SpriteDefinition; load: () => Promise<HTMLImageElement> }
  type SoundTask = { category: 'sound'; key: string; load: () => Promise<AudioBuffer> }
  type Task = SpriteTask | SoundTask
  const tasks: Task[] = [
    ...spriteEntries.map(([key, definition]): SpriteTask => ({ category: 'sprite', key, definition, load: () => loadImage(definition.url, { signal }) })),
    ...soundEntries.map(([key, url]): SoundTask => ({ category: 'sound', key, load: () => loadAudio(audioContext, url, { signal }) })),
  ]
  const total = tasks.length
  let loaded = 0
  onProgress({ loaded, total, ratio: total === 0 ? 1 : 0, item: null, status: 'start' })

  const results = await Promise.all(tasks.map(async (item) => {
    try {
      const value = await item.load()
      loaded++
      onProgress({ loaded, total, ratio: loaded / total, item: item.key, category: item.category, status: 'loaded' })
      return { item, value }
    } catch (error: unknown) {
      onProgress({ loaded, total, ratio: total === 0 ? 1 : loaded / total, item: item.key, category: item.category, status: 'error', error })
      throw error
    }
  }))

  const assets: LoadedAssets = { sprites: {}, sounds: {}, arena: manifest.arena }
  for (const result of results) {
    if (result.item.category === 'sprite' && result.value instanceof HTMLImageElement) {
      assets.sprites[result.item.key] = {
        image: result.value,
        frameWidth: result.item.definition.frameWidth,
        frameHeight: result.item.definition.frameHeight,
        frames: result.item.definition.frames,
      }
    } else if (result.item.category === 'sound' && result.value instanceof AudioBuffer) {
      assets.sounds[result.item.key] = result.value
    }
  }
  return assets
}
