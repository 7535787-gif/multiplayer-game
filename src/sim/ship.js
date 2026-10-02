export function createShip(x, y) {
  return {
    x,
    y,

    previousX: x,
    previousY: y,

    vx: 0,
    vy: 0,

    angle: 0,
    previousAngle: 0,
  };
}

export function integrate(ship, input, dt) {
  const acceleration = 500;
  const rotationSpeed = 3;

  const maxSpeed = 500;
  const braking = 350;
  const reverseAcceleration = 250;

  // Запам'ятовуємо попередній стан
  // перед зміною фізики
  ship.previousX = ship.x;
  ship.previousY = ship.y;
  ship.previousAngle = ship.angle;

  // Поворот вліво
  if (input.isDown("ArrowLeft")) {
    ship.angle -= rotationSpeed * dt;
  }

  // Поворот вправо
  if (input.isDown("ArrowRight")) {
    ship.angle += rotationSpeed * dt;
  }

  // Рух вперед
  if (input.isDown("ArrowUp")) {
    ship.vx += Math.cos(ship.angle) * acceleration * dt;
    ship.vy += Math.sin(ship.angle) * acceleration * dt;
  }

  // Гальмування / рух назад
  if (input.isDown("ArrowDown")) {
    const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);

    if (speed > 1) {
      const newSpeed = Math.max(0, speed - braking * dt);

      if (speed > 0) {
        ship.vx *= newSpeed / speed;
        ship.vy *= newSpeed / speed;
      }
    } else {
      ship.vx -= Math.cos(ship.angle) * reverseAcceleration * dt;
      ship.vy -= Math.sin(ship.angle) * reverseAcceleration * dt;
    }
  }

  // Обмеження максимальної швидкості
  const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);

  if (speed > maxSpeed) {
    ship.vx = (ship.vx / speed) * maxSpeed;
    ship.vy = (ship.vy / speed) * maxSpeed;
  }

  // Переміщення
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
}
