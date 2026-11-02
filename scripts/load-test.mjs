import WebSocket from 'ws'
import { setTimeout as delay } from 'node:timers/promises'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const roomId = process.env.ROOM_ID ?? 'deep-space'
const levels = [8, 32, 64, 128]
const durationMs = Number(process.env.DURATION_MS ?? 30000)
const percentile = (values, p) => values.length ? [...values].sort((a,b)=>a-b)[Math.min(values.length-1, Math.ceil(values.length*p)-1)] : 0

async function runLevel(count) {
  const sockets = []
  const tickSamples = []
  const metricsSamples = []
  let bytesIn = 0, bytesOut = 0, snapshots = 0
  const start = Date.now()
  const metricsTimer = setInterval(async () => {
    try {
      const response = await fetch(`${base}/metrics`)
      if (response.ok) {
        const metrics = await response.json()
        if (typeof metrics.tickP99Ms === 'number') tickSamples.push(metrics.tickP99Ms)
        metricsSamples.push(metrics)
      }
    } catch { /* server may be starting */ }
  }, 500)

  try {
    const roomIds = []
    const roomCount = Math.ceil(count / 8)
    for (let r = 0; r < roomCount; r++) {
      const response = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Load ${count} / ${r + 1}`, maxPlayers: 8 }) })
      if (!response.ok) throw new Error(`Could not create load room: HTTP ${response.status}`)
      const payload = await response.json()
      roomIds.push(payload.room.id)
    }
    for (let i = 0; i < count; i++) {
      const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws?protocol=json`)
      sockets.push(ws)
      await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
      ws.on('message', (data) => { bytesIn += data.length; snapshots++ })
      const message = JSON.stringify({ type: 'join', roomId: roomIds[Math.floor(i / 8)], name: `Load ${i + 1}` })
      bytesOut += Buffer.byteLength(message); ws.send(message)
    }

    const inputTimer = setInterval(() => {
      for (let i = 0; i < sockets.length; i++) {
        const ws = sockets[i]
        if (ws.readyState !== WebSocket.OPEN) continue
        const msg = JSON.stringify({ type: 'input', seq: Math.floor((Date.now() - start) / 33) + i * 100000, left: Math.random() > .5, right: Math.random() > .5, thrust: true, brake: false })
        bytesOut += Buffer.byteLength(msg); ws.send(msg)
      }
    }, 100)
    await delay(durationMs)
    clearInterval(inputTimer)
  } finally {
    clearInterval(metricsTimer)
    for (const ws of sockets) ws.close()
  }
  const elapsed = (Date.now() - start) / 1000
  const serverRssMB = metricsSamples.length ? (metricsSamples.at(-1).rssBytes / 1024 / 1024) : null
  const eventLoopUtilization = metricsSamples.length ? metricsSamples.reduce((sum, item) => sum + item.eventLoopUtilization, 0) / metricsSamples.length : null
  const eventLoopDelayP99Ms = metricsSamples.length ? percentile(metricsSamples.map((item) => item.eventLoopDelayP99Ms), .99) : null
  await delay(1000)
  const serverTickP99Ms = percentile(tickSamples, .99)
  return { clients: count, durationSeconds: elapsed, serverTickP99Ms, over33msBudget: serverTickP99Ms > 33, serverRssMB: serverRssMB == null ? null : Number(serverRssMB.toFixed(1)), eventLoopUtilization: eventLoopUtilization == null ? null : Number(eventLoopUtilization.toFixed(4)), eventLoopDelayP99Ms: eventLoopDelayP99Ms == null ? null : Number(eventLoopDelayP99Ms.toFixed(2)), inboundBytesPerSecond: Math.round(bytesIn / elapsed), outboundBytesPerSecond: Math.round(bytesOut / elapsed), snapshotsReceived: snapshots }
}

const results = []
for (const count of levels) {
  try { const result = await runLevel(count); results.push(result); console.log(JSON.stringify(result)) }
  catch (error) { console.error(`Load level ${count} failed:`, error instanceof Error ? error.message : error); process.exitCode = 1; break }
}
const capacity = results.find((result) => result.over33msBudget)?.clients ?? null
console.log(JSON.stringify({ estimatedCapacityClients: capacity, note: capacity === null ? 'No tested level exceeded the 33 ms tick budget.' : 'First tested level exceeding the 33 ms tick budget.' }))
