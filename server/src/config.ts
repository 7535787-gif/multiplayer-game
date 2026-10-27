import { z } from 'zod'

const serverEnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_DIR: z.string().trim().min(1).default('./logs'),
})

export interface ServerConfig {
  readonly port: number
  readonly logDir: string
}

/** Parse process environment once at startup; invalid configuration fails early. */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  const parsed = serverEnvSchema.safeParse({
    ...env,
    PORT: env.port ?? env.PORT,
  })

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')

    throw new Error(`Invalid server configuration: ${details}`)
  }

  return {
    port: parsed.data.PORT,
    logDir: parsed.data.LOG_DIR,
  }
}
