
export class HttpError extends Error {
    constructor(status, url) {
      super(`HTTP ${status}: ${url}`)
      this.name = 'HttpError'
      this.status = status
      this.url = url
    }
  }
  
  export class InvalidJsonError extends Error {
    constructor(url, cause) {
      super(`Некоректний JSON: ${url}`, { cause })
      this.name = 'InvalidJsonError'
      this.url = url
    }
  }
  
  function abortError(signal) {
    if (signal?.reason instanceof Error) {
      return signal.reason
    }
  
    return new DOMException(
      'Операцію скасовано',
      'AbortError'
    )
  }
  
  function throwIfAborted(signal) {
    if (signal?.aborted) {
      throw abortError(signal)
    }
  }
  
  function shouldRetry(error, signal) {
    if (
      signal?.aborted ||
      error.name === 'AbortError' ||
      error.name === 'InvalidJsonError'
    ) {
      return false
    }
  
    // Для HTTP 4xx повторних спроб немає.
    if (error instanceof HttpError) {
      return error.status >= 500
    }
  
    // Мережеві помилки можна повторити.
    return true
  }
  
  function delay(ms, signal) {
    return new Promise((resolve, reject) => {
      throwIfAborted(signal)
  
      const timer = setTimeout(() => {
        cleanup()
        resolve()
      }, ms)
  
      function cleanup() {
        signal?.removeEventListener('abort', onAbort)
      }
  
      function onAbort() {
        clearTimeout(timer)
        cleanup()
        reject(abortError(signal))
      }
  
      signal?.addEventListener(
        'abort',
        onAbort,
        { once: true }
      )
    })
  }
  
  export async function withRetry(
    task,
    {
      attempts = 3,
      baseMs = 250,
      signal,
    } = {}
  ) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      throwIfAborted(signal)
  
      try {
        return await task(signal)
      } catch (error) {
        const lastAttempt = attempt === attempts - 1
  
        if (
          lastAttempt ||
          !shouldRetry(error, signal)
        ) {
          throw error
        }
  
        // Експоненційне збільшення затримки.
        const backoff = baseMs * 2 ** attempt
  
        // Jitter — випадкове відхилення затримки.
        const jitter = 0.75 + Math.random() * 0.5
  
        await delay(backoff * jitter, signal)
      }
    }
  
    throw new Error('Не вдалося завантажити ресурс')
  }
  
  export async function fetchJson(url, { signal } = {}) {
    throwIfAborted(signal)
  
    const response = await fetch(url, { signal })
  
    if (!response.ok) {
      throw new HttpError(response.status, url)
    }
  
    try {
      return await response.json()
    } catch (error) {
      throwIfAborted(signal)
      throw new InvalidJsonError(url, error)
    }
  }
  
  export function loadJson(
    url,
    { signal, attempts = 3, baseMs = 250 } = {}
  ) {
    return withRetry(
      (currentSignal) =>
        fetchJson(url, { signal: currentSignal }),
      { signal, attempts, baseMs }
    )
  }
  
  export function loadImage(
    url,
    { signal, attempts = 3, baseMs = 250 } = {}
  ) {
    return withRetry(
      async (currentSignal) => {
        const response = await fetch(url, {
          signal: currentSignal,
        })
  
        if (!response.ok) {
          throw new HttpError(response.status, url)
        }
  
        const blob = await response.blob()
        throwIfAborted(currentSignal)
  
        const objectUrl = URL.createObjectURL(blob)
  
        try {
          return await new Promise((resolve, reject) => {
            const image = new Image()
  
            function cleanup() {
              image.removeEventListener('load', onLoad)
              image.removeEventListener('error', onError)
  
              currentSignal?.removeEventListener(
                'abort',
                onAbort
              )
            }
  
            function onLoad() {
              cleanup()
              resolve(image)
            }
  
            function onError() {
              cleanup()
  
              const error = new Error(
                `Не вдалося декодувати зображення: ${url}`
              )
  
              error.name = 'AssetDecodeError'
              reject(error)
            }
  
            function onAbort() {
              cleanup()
              image.src = ''
              reject(abortError(currentSignal))
            }
  
            image.addEventListener('load', onLoad, {
              once: true,
            })
  
            image.addEventListener('error', onError, {
              once: true,
            })
  
            currentSignal?.addEventListener(
              'abort',
              onAbort,
              { once: true }
            )
  
            if (currentSignal?.aborted) {
              onAbort()
              return
            }
  
            image.src = objectUrl
          })
        } finally {
          URL.revokeObjectURL(objectUrl)
        }
      },
      { signal, attempts, baseMs }
    )
  }
  
  export function loadAudio(
    audioContext,
    url,
    { signal, attempts = 3, baseMs = 250 } = {}
  ) {
    if (!audioContext) {
      throw new Error(
        'Для завантаження аудіо потрібен AudioContext'
      )
    }
  
    return withRetry(
      async (currentSignal) => {
        const response = await fetch(url, {
          signal: currentSignal,
        })
  
        if (!response.ok) {
          throw new HttpError(response.status, url)
        }
  
        const data = await response.arrayBuffer()
        throwIfAborted(currentSignal)
  
        const buffer = await audioContext.decodeAudioData(data)
  
        throwIfAborted(currentSignal)
  
        return buffer
      },
      { signal, attempts, baseMs }
    )
  }
  
  export async function loadAll(
    manifest,
    {
      onProgress = () => {},
      signal,
      audioContext,
    } = {}
  ) {
    const sprites = Object.entries(
      manifest.sprites ?? {}
    )
  
    const sounds = Object.entries(
      manifest.sounds ?? {}
    )
  
    if (sounds.length > 0 && !audioContext) {
      throw new Error(
        'Перед завантаженням звуків потрібно створити AudioContext'
      )
    }
  
    const tasks = [
      ...sprites.map(([key, definition]) => ({
        category: 'sprite',
        key,
        definition,
        load: () =>
          loadImage(definition.url, { signal }),
      })),
  
      ...sounds.map(([key, url]) => ({
        category: 'sound',
        key,
        load: () =>
          loadAudio(audioContext, url, { signal }),
      })),
    ]
  
    const total = tasks.length
    let loaded = 0
  
    onProgress({
      loaded,
      total,
      ratio: total === 0 ? 1 : 0,
      item: null,
      status: 'start',
    })
  
    const results = await Promise.all(
      tasks.map(async (item) => {
        try {
          const value = await item.load()
  
          loaded++
  
          onProgress({
            loaded,
            total,
            ratio: loaded / total,
            item: item.key,
            category: item.category,
            status: 'loaded',
          })
  
          return { ...item, value }
        } catch (error) {
          onProgress({
            loaded,
            total,
            ratio: total === 0 ? 1 : loaded / total,
            item: item.key,
            category: item.category,
            status: 'error',
            error,
          })
  
          throw error
        }
      })
    )
  
    const assets = {
      sprites: {},
      sounds: {},
      arena: manifest.arena,
    }
  
    for (const result of results) {
      if (result.category === 'sprite') {
        assets.sprites[result.key] = {
          image: result.value,
          frameWidth: result.definition.frameWidth,
          frameHeight: result.definition.frameHeight,
          frames: result.definition.frames,
        }
      }
  
      if (result.category === 'sound') {
        assets.sounds[result.key] = result.value
      }
    }
  
    return assets
  }
  