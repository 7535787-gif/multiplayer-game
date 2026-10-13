import { writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'

const url = 'http://localhost:3000/api/replays/large-test'
const durationMs = 60_000
const intervalMs = 500

const samples = []
const startedAt = Date.now()

console.log('Вимірювання почалося.')
console.log('Переконайся, що сервер npm start працює.')

const download = fetch(url).then(async (response) => {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  let bytes = 0

  for await (const chunk of response.body) {
    bytes += chunk.length
  }

  console.log(`Завантажено ${(bytes / 1024 / 1024).toFixed(2)} MiB`)
})

const sampler = (async () => {
  while (Date.now() - startedAt < durationMs) {
    samples.push({
      elapsedSeconds: Number(
        ((Date.now() - startedAt) / 1000).toFixed(1),
      ),
      note: 'Завантаження журналу',
    })

    await sleep(intervalMs)
  }
})()

try {
  await Promise.all([download, sampler])

  const csv = [
    'elapsedSeconds,note',
    ...samples.map((s) => `${s.elapsedSeconds},${s.note}`),
  ].join('\n')

  await writeFile('server/logs/rss.csv', csv, 'utf8')
  console.log('Збережено server/logs/rss.csv')
} catch (error) {
  console.error('Помилка тесту:', error.message)
  process.exitCode = 1
}