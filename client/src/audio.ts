
import { GAME_EVENTS, onGameEvent } from './sim/events.js'

export type SoundName = 'shoot' | 'hit' | 'explosion'
export type SoundBuffers = Partial<Record<SoundName, AudioBuffer>>

export function createAudioPlayer(
  audioContext: AudioContext | null,
  sounds: SoundBuffers,
): () => void {
  function playSound(name: SoundName): void {
    const buffer = sounds[name]

    if (!buffer || !audioContext) return

    try {
      const source = audioContext.createBufferSource()
      const gain = audioContext.createGain()

      source.buffer = buffer
      gain.gain.value = 0.35

      source.connect(gain)
      gain.connect(audioContext.destination)
      source.start(0)

      source.addEventListener(
        'ended',
        () => {
          source.disconnect()
          gain.disconnect()
        },
        { once: true },
      )
    } catch (error: unknown) {
      console.warn(`Не вдалося відтворити звук "${name}":`, error)
    }
  }

  const unsubscribeFired = onGameEvent(
    GAME_EVENTS.FIRED,
    () => playSound('shoot'),
  )

  const unsubscribeHit = onGameEvent(
    GAME_EVENTS.HIT,
    () => playSound('hit'),
  )

  const unsubscribeExploded = onGameEvent(
    GAME_EVENTS.EXPLODED,
    () => playSound('explosion'),
  )

  return (): void => {
    unsubscribeFired()
    unsubscribeHit()
    unsubscribeExploded()
  }
}
