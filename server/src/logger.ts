import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Transform, pipeline } from 'node:stream'
import { promisify } from 'node:util'

const pipelineAsync = promisify(pipeline)
export interface LogRecord { readonly [key: string]: unknown }
export interface Logger { log(event: LogRecord): Promise<void>; close(): Promise<void> }

export async function createLogger(logDir: string): Promise<Logger> {
  await mkdir(logDir, { recursive: true })
  const output = createWriteStream(join(logDir, 'server.ndjson'), { flags: 'a' })
  const formatter = new Transform({
    writableObjectMode: true,
    transform(event: LogRecord, _encoding, callback) {
      callback(null, `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`)
    },
  })
  const finished = pipelineAsync(formatter, output)
  return {
    log(event) {
      return new Promise((resolve, reject) => {
        formatter.write(event, (error) => error ? reject(error) : resolve())
      })
    },
    async close() { formatter.end(); await finished },
  }
}
