export interface TokenBucketOptions {
  readonly capacity: number
  readonly refillPerSecond: number
  readonly now?: () => number
}

/** Small monotonic-clock token bucket suitable for per-connection message limits. */
export function createTokenBucket({ capacity, refillPerSecond, now = () => performance.now() }: TokenBucketOptions) {
  if (!Number.isFinite(capacity) || capacity <= 0 || !Number.isFinite(refillPerSecond) || refillPerSecond < 0) {
    throw new RangeError('Invalid token bucket configuration')
  }
  let tokens = capacity
  let last = now()
  return {
    consume(cost = 1): boolean {
      if (!Number.isFinite(cost) || cost <= 0) return false
      const current = now()
      const elapsed = Math.max(0, current - last) / 1000
      last = current
      tokens = Math.min(capacity, tokens + elapsed * refillPerSecond)
      if (tokens < cost) return false
      tokens -= cost
      return true
    },
    available(): number {
      return tokens
    },
  }
}
