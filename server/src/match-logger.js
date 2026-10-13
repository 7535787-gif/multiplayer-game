import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Transform, pipeline } from 'node:stream'
import { promisify } from 'node:util'

const pipelineAsync = promisify(pipeline)

export async function createMatchLogger(roomId, logDir) {
  await mkdir(logDir, { recursive: true })

  const safeId = String(roomId).replace(/[^a-zA-Z0-9_-]/g, '_')
  const filePath = join(logDir, `match-${safeId}.ndjson`)

  const output = createWriteStream(filePath, { flags: 'a' })

  const formatter = new Transform({
    writableObjectMode: true,

    transform(event, encoding, callback) {
      try {
        callback(
          null,
          `${JSON.stringify({
            timestamp: new Date().toISOString(),
            roomId,
            ...event,
          })}\n`,
        )
      } catch (error) {
        callback(error)
      }
    },
  })

  const finished = pipelineAsync(formatter, output)

  finished.catch((error) => {
    console.error(`Помилка журналу кімнати ${roomId}:`, error)
  })

  let closed = false

  return {
    filePath,

    log(event) {
      if (closed) {
        return Promise.reject(
          new Error(`Журнал кімнати ${roomId} вже закрито`),
        )
      }

      return new Promise((resolve, reject) => {
        formatter.write(event, (error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    },

    async close() {
      if (closed) return

      closed = true
      formatter.end()
      await finished
    },
  }
}