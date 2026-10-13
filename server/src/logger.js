import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Transform, pipeline } from 'node:stream'
import { promisify } from 'node:util'

const pipelineAsync = promisify(pipeline)

export async function createLogger(logDir) {
  await mkdir(logDir, { recursive: true })

  const output = createWriteStream(
    join(logDir, 'server.ndjson'),
    { flags: 'a' }
  )

  const formatter = new Transform({
    writableObjectMode: true,

    transform(event, encoding, callback) {
      callback(null, `${JSON.stringify({
        timestamp: new Date().toISOString(),
        ...event,
      })}\n`)
    },
  })

  const finished = pipelineAsync(formatter, output)

  return {
    log(event) {
      return new Promise((resolve, reject) => {
        formatter.write(event, (error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    },

    async close() {
      formatter.end()
      await finished
    },
  }
}