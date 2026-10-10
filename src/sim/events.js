// Єдина шина подій гри.
// Симуляція повідомляє про події, але не залежить від аудіо чи інтерфейсу.

export const GAME_EVENTS = Object.freeze({
    FIRED: 'fired',
    HIT: 'hit',
    EXPLODED: 'exploded',
  })
  
  const gameEvents = new EventTarget()
  
  // Створює та надсилає подію з додатковими даними.
  export function emitGameEvent(type, detail = {}) {
    gameEvents.dispatchEvent(
      new CustomEvent(type, { detail })
    )
  }
  
  // Підписує на подію.
  // Повертає функцію, яка скасовує підписку.
  export function onGameEvent(type, listener) {
    const handler = (event) => {
      listener(event.detail, event)
    }
  
    gameEvents.addEventListener(type, handler)
  
    return () => {
      gameEvents.removeEventListener(type, handler)
    }
  }