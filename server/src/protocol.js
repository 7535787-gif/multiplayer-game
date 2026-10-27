import { parseClientMessage } from '../../shared/protocol.js'

/** Compatibility adapter for existing server callers; validation lives in the shared Zod schema. */
export function validateMessage(message) {
  const result = parseClientMessage(message)
  if (result.ok) return { valid: true, message: result.value }
  const type = message && typeof message === 'object' && 'type' in message ? message.type : undefined
  return { valid: false, code: 1008, reason: `Invalid ${typeof type === 'string' ? type : 'message'} message: ${result.error.issues.map((issue) => issue.message).join('; ')}` }
}
