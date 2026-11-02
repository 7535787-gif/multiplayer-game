const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const roomId = process.env.ROOM_ID ?? 'deep-space'
const count = Number(process.argv[2] ?? 8)
const response = await fetch(`${base}/api/rooms/${encodeURIComponent(roomId)}/bots`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ count }) })
const body = await response.text()
console.log(body)
if (!response.ok) process.exitCode = 1
