
export interface InputController {
    isDown(code: string): boolean
  }
  
  export function createInput(
    target: Window = window,
  ): InputController {
    const keys = new Set<string>()
  
    function onKeyDown(event: KeyboardEvent): void {
      keys.add(event.code)
  
      if (
        event.code === 'ArrowUp' ||
        event.code === 'ArrowDown' ||
        event.code === 'ArrowLeft' ||
        event.code === 'ArrowRight'
      ) {
        event.preventDefault()
      }
    }
  
    function onKeyUp(event: KeyboardEvent): void {
      keys.delete(event.code)
    }
  
    target.addEventListener('keydown', onKeyDown)
    target.addEventListener('keyup', onKeyUp)
  
    return {
      isDown(code: string): boolean {
        return keys.has(code)
      },
    }
  }
  