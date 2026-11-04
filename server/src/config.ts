import { z } from 'zod'

const serverEnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_DIR: z.string().trim().min(1).default('./logs'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  MAX_CONNECTIONS_PER_IP: z.coerce.number().int().min(1).max(1000).default(10),
  MAX_ROOMS: z.coerce.number().int().min(3).max(10000).default(20),
  MAX_PLAYERS_PER_ROOM: z.coerce.number().int().min(2).max(128).default(16),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
})

export interface ServerConfig {
  readonly port: number
  readonly logDir: string
  readonly logLevel: string
  readonly allowedOrigins: readonly string[]
  readonly maxConnectionsPerIp: number
  readonly maxRooms: number
  readonly maxPlayersPerRoom: number
  readonly trustProxy: boolean
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const parsed = serverEnvSchema.safeParse(env)
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Invalid server configuration: ${details}`)
  }
  return {
    port: parsed.data.PORT,
    logDir: parsed.data.LOG_DIR,
    logLevel: parsed.data.LOG_LEVEL,
    allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
    maxConnectionsPerIp: parsed.data.MAX_CONNECTIONS_PER_IP,
    maxRooms: parsed.data.MAX_ROOMS,
    maxPlayersPerRoom: parsed.data.MAX_PLAYERS_PER_ROOM,
    trustProxy: parsed.data.TRUST_PROXY === 'true',
  }
}
