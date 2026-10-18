/** Interpolate a remote player's buffered snapshots at a local render timestamp. */
export function interpolateRemotePlayer(player, renderTime, arena = null) {
  const samples = player?.samples || []
  if (samples.length === 0) return null

  if (samples.length === 1 || renderTime <= samples[0].receivedAt) {
    return { ...samples[0], name: player.name }
  }

  for (let index = 1; index < samples.length; index++) {
    const older = samples[index - 1]
    const newer = samples[index]
    if (renderTime <= newer.receivedAt) {
      const span = Math.max(1, newer.receivedAt - older.receivedAt)
      const alpha = Math.max(0, Math.min(1, (renderTime - older.receivedAt) / span))
      let angleDelta = newer.angle - older.angle
      while (angleDelta > Math.PI) angleDelta -= Math.PI * 2
      while (angleDelta < -Math.PI) angleDelta += Math.PI * 2

      let deltaX = newer.x - older.x
      let deltaY = newer.y - older.y
      if (arena) {
        if (deltaX > arena.width / 2) deltaX -= arena.width
        if (deltaX < -arena.width / 2) deltaX += arena.width
        if (deltaY > arena.height / 2) deltaY -= arena.height
        if (deltaY < -arena.height / 2) deltaY += arena.height
      }
      let x = older.x + deltaX * alpha
      let y = older.y + deltaY * alpha
      if (arena) {
        x = ((x % arena.width) + arena.width) % arena.width
        y = ((y % arena.height) + arena.height) % arena.height
      }
      return {
        name: player.name,
        x,
        y,
        angle: older.angle + angleDelta * alpha,
        receivedAt: renderTime,
      }
    }
  }

  return { ...samples[samples.length - 1], name: player.name }
}
