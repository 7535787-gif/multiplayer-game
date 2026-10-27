import { z } from 'zod'
import { entityIdSchema, seqSchema, tickSchema } from './types.js'
import type { Snapshot, ShipInput } from './types.js'
import { decodePacket, encodeSnapshot } from './network-protocol.js'

const MAX_NAME_LENGTH = 24
const MAX_CHAT_LENGTH = 500
const MAX_ROOM_ID_LENGTH = 100

export const joinMessageSchema = z.object({ type: z.literal('join'), roomId: z.string().trim().min(1).max(MAX_ROOM_ID_LENGTH), name: z.string().trim().min(1).max(MAX_NAME_LENGTH) }).strict()
export const inputMessageSchema = z.object({ type: z.literal('input'), seq: z.number().int().safe().min(0).max(0xffffffff).brand<'Seq'>(), left: z.boolean(), right: z.boolean(), thrust: z.boolean(), brake: z.boolean() }).strict()
export const pingMessageSchema = z.object({ type: z.literal('ping'), sentAt: z.number().finite() }).strict()
export const chatMessageSchema = z.object({ type: z.literal('chat'), text: z.string().trim().min(1).max(MAX_CHAT_LENGTH) }).strict()
export const fireMessageSchema = z.object({ type: z.literal('fire'), homing: z.boolean() }).strict()

export const clientMessageSchema = z.discriminatedUnion('type', [joinMessageSchema, inputMessageSchema, pingMessageSchema, chatMessageSchema, fireMessageSchema])
export type ClientMessage = z.infer<typeof clientMessageSchema>
export type JoinMessage = z.infer<typeof joinMessageSchema>
export type InputMessage = z.infer<typeof inputMessageSchema>
export type PingMessage = z.infer<typeof pingMessageSchema>
export type ChatMessage = z.infer<typeof chatMessageSchema>
export type FireMessage = z.infer<typeof fireMessageSchema>

const snapshotPlayerSchema = z.object({ id: entityIdSchema, name: z.string(), x: z.number().finite(), y: z.number().finite(), vx: z.number().finite(), vy: z.number().finite(), angle: z.number().finite(), ackSeq: seqSchema })
export const snapshotSchema = z.object({ type: z.literal('snapshot'), tick: tickSchema, seed: z.number().int().safe().min(0).max(0xffffffff), players: z.array(snapshotPlayerSchema).max(255) }).strict() satisfies z.ZodType<Snapshot, z.ZodTypeDef, unknown>

export const serverMessageSchema = z.discriminatedUnion('type', [
  snapshotSchema,
  z.object({
    type: z.literal('joined'),
    playerId: z.string(),
    roomId: z.string(),
  }).strict(),
  z.object({
    type: z.literal('error'),
    message: z.string(),
  }).strict(),
  z.object({
    type: z.literal('pong'),
    sentAt: z.number().finite(),
    serverTime: z.number().finite().optional(),
  }).strict(),
  z.object({
    type: z.literal('chat'),
    playerId: z.string(),
    name: z.string(),
    text: z.string(),
    sentAt: z.number().finite().optional(),
  }).strict(),
  z.object({
    type: z.literal('player-joined'),
    playerId: z.string(),
    name: z.string(),
  }).strict(),
  z.object({
    type: z.literal('player-left'),
    playerId: z.string(),
  }).strict(),
])

export type ServerMessage = z.infer<typeof serverMessageSchema>

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E }
export function parseClientMessage(data: unknown): Result<ClientMessage, z.ZodError> {
  const parsed = clientMessageSchema.safeParse(data)
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: parsed.error }
}
export function parseServerMessage(data: unknown): Result<ServerMessage, z.ZodError> {
  const parsed = serverMessageSchema.safeParse(data)
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: parsed.error }
}

export interface Codec<T> { encode(value: T): string | ArrayBuffer; decode(data: string | ArrayBuffer): T }
export const jsonSnapshotCodec: Codec<Snapshot> = {
  encode(value) { const parsed = snapshotSchema.parse(value); return JSON.stringify(parsed) },
  decode(data) { if (typeof data !== 'string') throw new TypeError('JSON codec expects a string'); const raw: unknown = JSON.parse(data); return snapshotSchema.parse(raw) },
}


export const binarySnapshotCodec: Codec<Snapshot> = {
  encode(value) {
    return encodeSnapshot(value)
  },
  decode(data) {
    if (!(data instanceof ArrayBuffer)) {
      throw new TypeError('Binary codec expects an ArrayBuffer')
    }

    const packet = decodePacket(data)

    if (packet.type !== 'snapshot') {
      throw new TypeError('Binary codec expected a snapshot packet')
    }

    return snapshotSchema.parse(packet)
  },
}

