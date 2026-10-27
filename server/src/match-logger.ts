import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Transform, pipeline } from 'node:stream'
import { promisify } from 'node:util'

const pipelineAsync = promisify(pipeline)
export interface MatchLogRecord { readonly [key: string]: unknown }
export interface MatchLogger { readonly filePath: string; log(event: MatchLogRecord): Promise<void>; close(): Promise<void> }

export async function createMatchLogger(roomId: string, logDir: string): Promise<MatchLogger> {
  await mkdir(logDir, { recursive: true })
  const safeId = roomId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const filePath = join(logDir, `match-${safeId}.ndjson`)
  const output = createWriteStream(filePath, { flags: 'a' })
  const formatter = new Transform({
    writableObjectMode: true,
    transform(event: MatchLogRecord, _encoding, callback) {
      callback(null, `${JSON.stringify({ timestamp: new Date().toISOString(), roomId, ...event })}\n`)
    },
  })
  const finished = pipelineAsync(formatter, output)
  finished.catch((error: unknown) => console.error(`Помилка журналу кімнати ${roomId}:`, error))
  let closed = false
  return {
    filePath,
    log(event) {
      if (closed) return Promise.reject(new Error(`Журнал кімнати ${roomId} вже закрито`))
      return new Promise((resolve, reject) => formatter.write(event, (error) => error ? reject(error) : resolve()))
    },
    async close() { if (closed) return; closed = true; formatter.end(); await finished },
  }
}
