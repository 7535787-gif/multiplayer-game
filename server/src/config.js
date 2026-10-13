export function loadConfig(env = process.env) {
    const port = Number(env.port ?? env.PORT ?? 3000)
    const logDir = env.LOG_DIR ?? './logs'
  
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('port має бути числом від 1 до 65535')
    }
  
    if (!logDir.trim()) {
      throw new Error('log_dir не може бути порожнім')
    }
  
    return { port, logDir }
  }