import { z } from 'zod'

/** Branded primitives prevent accidentally mixing IDs, simulation ticks and input sequence numbers. */
export type Brand<T, Name extends string> = T & { readonly __brand: Name }

export const entityIdSchema = z.string().brand<'EntityId'>()
export const tickSchema = z.number().int().min(0).max(0xffffffff).brand<'Tick'>()
export const seqSchema = z.number().int().safe().brand<'Seq'>()

export type EntityId = z.infer<typeof entityIdSchema>
export type Tick = z.infer<typeof tickSchema>
export type Seq = z.infer<typeof seqSchema>

export interface Vector2Like {
  readonly x: number
  readonly y: number
}

export interface ShipState {
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly angle: number
}

export interface ShipInput {
  readonly left: boolean
  readonly right: boolean
  readonly thrust: boolean
  readonly brake: boolean
}

export interface ArenaSize {
  readonly width: number
  readonly height: number
}

export interface SnapshotPlayer extends ShipState {
  readonly id: EntityId
  readonly name: string
  readonly ackSeq: Seq
}

export interface Snapshot {
  readonly type: 'snapshot'
  readonly tick: Tick
  readonly seed: number
  readonly players: readonly SnapshotPlayer[]
}

/** Snapshot entities use kind as a discriminator so each variant has a known shape. */
export type EntitySnapshot =
  | { readonly kind: 'ship'; readonly id: EntityId; readonly position: Vector2Like; readonly health: number }
  | { readonly kind: 'bullet'; readonly id: EntityId; readonly position: Vector2Like; readonly ownerId: EntityId }
  | { readonly kind: 'asteroid'; readonly id: EntityId; readonly position: Vector2Like; readonly radius: number }
  | { readonly kind: 'pickup'; readonly id: EntityId; readonly position: Vector2Like; readonly amount: number }
