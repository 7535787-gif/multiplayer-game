import { z } from 'zod'

const MAX_NAME_LENGTH = 24
const MAX_CHAT_LENGTH = 500
const MAX_ROOM_ID_LENGTH = 100
export const joinMessageSchema = z.object({ type: z.literal('join'), roomId: z.string().trim().min(1).max(MAX_ROOM_ID_LENGTH), name: z.string().trim().min(1).max(MAX_NAME_LENGTH) }).strict()
export const inputMessageSchema = z.object({ type: z.literal('input'), seq: z.number().int().safe().min(0).max(0xffffffff), left: z.boolean(), right: z.boolean(), thrust: z.boolean(), brake: z.boolean() }).strict()
export const pingMessageSchema = z.object({ type: z.literal('ping'), sentAt: z.number().finite() }).strict()
export const chatMessageSchema = z.object({ type: z.literal('chat'), text: z.string().trim().min(1).max(MAX_CHAT_LENGTH) }).strict()
export const fireMessageSchema = z.object({ type: z.literal('fire'), homing: z.boolean() }).strict()
export const clientMessageSchema = z.discriminatedUnion('type', [joinMessageSchema, inputMessageSchema, pingMessageSchema, chatMessageSchema, fireMessageSchema])
const snapshotPlayerSchema = z.object({ id: z.string(), name: z.string(), x: z.number().finite(), y: z.number().finite(), vx: z.number().finite(), vy: z.number().finite(), angle: z.number().finite(), ackSeq: z.number().int().safe() })
export const snapshotSchema = z.object({ type: z.literal('snapshot'), tick: z.number().int().safe().min(0).max(0xffffffff), seed: z.number().int().safe().min(0).max(0xffffffff), players: z.array(snapshotPlayerSchema).max(255) }).strict()
export const serverMessageSchema = z.discriminatedUnion('type', [snapshotSchema, z.object({ type: z.literal('joined'), playerId: z.string(), roomId: z.string() }), z.object({ type: z.literal('error'), message: z.string() }), z.object({ type: z.literal('pong'), sentAt: z.number().finite(), serverTime: z.number().finite().optional() }), z.object({ type: z.literal('chat'), playerId: z.string(), name: z.string(), text: z.string(), sentAt: z.number().finite().optional() }), z.object({ type: z.literal('player-joined'), playerId: z.string(), name: z.string() }), z.object({ type: z.literal('player-left'), playerId: z.string() })])
export function parseClientMessage(data) { const parsed = clientMessageSchema.safeParse(data); return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: parsed.error } }
export function parseServerMessage(data) { const parsed = serverMessageSchema.safeParse(data); return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: parsed.error } }
export const jsonSnapshotCodec = { encode(value) { return JSON.stringify(snapshotSchema.parse(value)) }, decode(data) { if (typeof data !== 'string') throw new TypeError('JSON codec expects a string'); return snapshotSchema.parse(JSON.parse(data)) } }
