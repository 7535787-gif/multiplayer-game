export function createInput(target = window) {
  const keys = new Set();

  function onKeyDown(event) {
    keys.add(event.code);

    // Забороняємо браузеру прокручувати сторінку
    // при натисканні стрілок
    if (
      event.code === "ArrowUp" ||
      event.code === "ArrowDown" ||
      event.code === "ArrowLeft" ||
      event.code === "ArrowRight"
    ) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);

  return {
    isDown(code) {
      return keys.has(code);
    },
  };
}
