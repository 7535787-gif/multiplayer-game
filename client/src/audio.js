import { GAME_EVENTS, onGameEvent } from './sim/events.js'

export function createAudioPlayer(audioContext, sounds) {
  function playSound(name) {
    const buffer = sounds?.[name]

    // Якщо звук не завантажений, нічого не відтворюємо.
    if (!buffer || !audioContext) {
      return
    }

    try {
      const source = audioContext.createBufferSource()
      const gain = audioContext.createGain()

      source.buffer = buffer
      gain.gain.value = 0.35

      source.connect(gain)
      gain.connect(audioContext.destination)

      source.start(0)

      // Звільняємо з'єднання після завершення відтворення.
      source.addEventListener(
        'ended',
        () => {
          source.disconnect()
          gain.disconnect()
        },
        { once: true }
      )
    } catch (error) {
      console.warn(`Не вдалося відтворити звук "${name}":`, error)
    }
  }

  // Звичайний і самонавідний постріли.
  const unsubscribeFired = onGameEvent(
    GAME_EVENTS.FIRED,
    () => playSound('shoot')
  )

  // Звук влучання.
  const unsubscribeHit = onGameEvent(
    GAME_EVENTS.HIT,
    () => playSound('hit')
  )

  // Звук вибуху.
  const unsubscribeExploded = onGameEvent(
    GAME_EVENTS.EXPLODED,
    () => playSound('explosion')
  )

  // Функція для скасування всіх підписок.
  return function destroyAudioPlayer() {
    unsubscribeFired()
    unsubscribeHit()
    unsubscribeExploded()
  }
}