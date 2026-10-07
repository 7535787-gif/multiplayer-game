export function wrapPosition(ship, width, height) {
  let wrapped = false

  if (ship.pos.x < 0) {
    ship.pos.x += width
    wrapped = true
  }

  if (ship.pos.x >= width) {
    ship.pos.x -= width
    wrapped = true
  }

  if (ship.pos.y < 0) {
    ship.pos.y += height
    wrapped = true
  }

  if (ship.pos.y >= height) {
    ship.pos.y -= height
    wrapped = true
  }

  // Якщо корабель перейшов через край,
  // не інтерполюємо його через весь екран
  if (wrapped) {
    ship.previousPosition = ship.pos
  }
}