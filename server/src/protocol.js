const MAX_NAME_LENGTH = 24
const MAX_CHAT_LENGTH = 500
const MAX_ROOM_ID_LENGTH = 100

export function validateMessage(message) {
  if (
    !message ||
    typeof message !== 'object' ||
    Array.isArray(message) ||
    typeof message.type !== 'string'
  ) {
    return {
      valid: false,
      code: 1008,
      reason: 'Invalid message structure',
    }
  }

  switch (message.type) {
    case 'join': {
      if (
        typeof message.roomId !== 'string' ||
        message.roomId.trim().length === 0 ||
        message.roomId.length > MAX_ROOM_ID_LENGTH ||
        typeof message.name !== 'string' ||
        message.name.trim().length === 0 ||
        message.name.trim().length > MAX_NAME_LENGTH
      ) {
        return {
          valid: false,
          code: 1008,
          reason: 'Invalid join message',
        }
      }

      return { valid: true }
    }

    case 'input': {
      if (
        !Number.isSafeInteger(message.seq) ||
        message.seq < 0 ||
        typeof message.left !== 'boolean' ||
        typeof message.right !== 'boolean' ||
        typeof message.thrust !== 'boolean' ||
        typeof message.brake !== 'boolean'
      ) {
        return {
          valid: false,
          code: 1008,
          reason: 'Invalid input message',
        }
      }

      return { valid: true }
    }

    case 'ping': {
      if (!Number.isFinite(message.sentAt)) {
        return { valid: false, code: 1008, reason: 'Invalid ping message' }
      }
      return { valid: true }
    }

    case 'chat': {
      if (
        typeof message.text !== 'string' ||
        message.text.trim().length === 0 ||
        message.text.length > MAX_CHAT_LENGTH
      ) {
        return {
          valid: false,
          code: 1008,
          reason: 'Invalid chat message',
        }
      }

      return { valid: true }
    }

    case 'fire': {
      if (
        typeof message.homing !== 'boolean' ||
        'x' in message || 'y' in message || 'angle' in message
      ) {
        return { valid: false, code: 1008, reason: 'Invalid fire message' }
      }
      return { valid: true }
    }

    default:
      return {
        valid: false,
        code: 1008,
        reason: 'Unknown message type',
      }
  }
}