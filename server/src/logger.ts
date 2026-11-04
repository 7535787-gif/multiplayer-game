
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import pino from 'pino'

export interface LogRecord {
  readonly [key: string]: unknown
}

export interface Logger {
  log(event: LogRecord): Promise<void>
  flush(): Promise<void>
  close(): Promise<void>
}

export async function createLogger(
  logDir: string,
  level = 'info',
): Promise<Logger> {
  await mkdir(logDir, { recursive: true })

  const fileStream = createWriteStream(
    join(logDir, 'server.ndjson'),
    { flags: 'a' },
  )

  const logger = pino(
    {
      level,
      timestamp: pino.stdTimeFunctions.isoTime,
      base: { service: 'multiplayer-game' },
    },
    pino.multistream([
      { stream: process.stdout },
      { stream: fileStream },
    ]),
  )

  return {
    log(event) {
      const { level: eventLevel = 'info', type, ...fields } = event

      const record = { ...fields, type }

      switch (eventLevel) {
        case 'fatal':
          logger.fatal(record)
          break
        case 'error':
          logger.error(record)
          break
        case 'warn':
          logger.warn(record)
          break
        case 'debug':
          logger.debug(record)
          break
        case 'trace':
          logger.trace(record)
          break
        default:
          logger.info(record)
      }

      return Promise.resolve()
    },

    async flush() {
      await new Promise<void>((resolve, reject) => {
        fileStream.write('', (error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    },

    async close() {
      await new Promise<void>((resolve, reject) => {
        fileStream.end((error?: Error | null) => {
          if (error) reject(error)
          else resolve()
        })
      })
    },
  }
}
