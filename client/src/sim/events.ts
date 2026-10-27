
export const GAME_EVENTS = Object.freeze({
    FIRED: 'fired',
    HIT: 'hit',
    EXPLODED: 'exploded',
  })
  
  const gameEvents = new EventTarget()
  
  export function emitGameEvent(
    type: string,
    detail: Record<string, unknown> = {},
  ): void {
    gameEvents.dispatchEvent(new CustomEvent(type, { detail }))
  }
  
  export function onGameEvent(
    type: string,
    listener: (detail: Record<string, unknown>, event: CustomEvent) => void,
  ): () => void {
    const handler = (event: Event): void => {
      if (event instanceof CustomEvent) {
        listener(event.detail, event)
      }
    }
  
    gameEvents.addEventListener(type, handler)
  
    return () => {
      gameEvents.removeEventListener(type, handler)
    }
  }
  