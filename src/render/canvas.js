export function createCanvas(width = 1000, height = 700) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  function resize() {
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();

  window.addEventListener("resize", resize);

  return {
    canvas,
    ctx,
    width,
    height,
  };
}
