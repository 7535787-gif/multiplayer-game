
import { Vector2 } from './vector.js'

export interface WrappableShip {
  pos: Vector2
  previousPosition?: Vector2
}

export function wrapPosition(
  ship: WrappableShip,
  width: number,
  height: number,
): void {
  let x = ship.pos.x
  let y = ship.pos.y
  let wrapped = false

  if (x < 0) {
    x += width
    wrapped = true
  }

  if (x >= width) {
    x -= width
    wrapped = true
  }

  if (y < 0) {
    y += height
    wrapped = true
  }

  if (y >= height) {
    y -= height
    wrapped = true
  }

  if (wrapped) {
    ship.pos = new Vector2(x, y)
    ship.previousPosition = new Vector2(x, y)
  }
}
