/**
 * Span-based frame profiler for Astrolabe
 *
 * Replaces the ad-hoc timing in devMode.ts with a structured tracing model.
 * Every measurable operation becomes a named span with performance.now() timestamps.
 * Spans are collected per-frame into FrameTrace objects in a fixed-size ring buffer.
 *
 * Zero-cost when disabled: every public method gates on `this.enabled`.
 */

// ============================================
// Types
// ============================================

export interface SpanEvent {
  name: string
  start: number       // performance.now() timestamp
  dur: number         // duration in ms
  depth: number       // nesting depth (0 = top-level)
  thread: 'main' | 'worker'
  meta?: Record<string, number | string>
}

export interface FrameTrace {
  frameId: number
  start: number       // performance.now() at frame begin
  dur: number         // total frame duration
  spans: SpanEvent[]
}

export interface SpanAggregate {
  name: string
  count: number
  avg: number
  p95: number
  max: number
  last: number
}

// ============================================
// Profiler
// ============================================

const RING_SIZE = 240 // ~4s at 60fps
const NOTIFY_INTERVAL = 8 // notify listeners every N frames

type FrameListener = () => void

export class Profiler {
  enabled = false

  // Ring buffer
  private _frames: (FrameTrace | null)[] = new Array(RING_SIZE).fill(null)
  private _head = 0
  private _frameCount = 0

  // Current frame state
  private _currentFrame: FrameTrace | null = null
  private _spanDepth = 0

  // One-shot spans (from useMemo etc, flushed into next frame)
  private _pendingOneShots: SpanEvent[] = []

  // Metadata (set by instrumented code each frame)
  rendererStats = { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 }
  nodeCount = 0
  edgeCount = 0
  stableFrames = 0

  // Listeners
  private _listeners = new Set<FrameListener>()

  // ---- Frame lifecycle ----

  beginFrame(): void {
    if (!this.enabled) return
    const now = performance.now()
    this._currentFrame = {
      frameId: this._frameCount++,
      start: now,
      dur: 0,
      spans: [],
    }
    this._spanDepth = 0

    // Flush pending one-shots into this frame
    if (this._pendingOneShots.length > 0) {
      this._currentFrame.spans.push(...this._pendingOneShots)
      this._pendingOneShots.length = 0
    }
  }

  endFrame(): void {
    if (!this.enabled || !this._currentFrame) return
    this._currentFrame.dur = performance.now() - this._currentFrame.start
    this._frames[this._head] = this._currentFrame
    this._head = (this._head + 1) % RING_SIZE
    this._currentFrame = null

    if (this._frameCount % NOTIFY_INTERVAL === 0) {
      this._notifyListeners()
    }
  }

  // ---- Span API ----

  span<T>(name: string, fn: () => T, meta?: Record<string, number | string>): T {
    if (!this.enabled || !this._currentFrame) return fn()
    const depth = this._spanDepth
    this._spanDepth++
    const start = performance.now()
    try {
      return fn()
    } finally {
      const dur = performance.now() - start
      this._currentFrame!.spans.push({ name, start, dur, depth, thread: 'main', meta })
      this._spanDepth--
    }
  }

  pushWorkerSpan(name: string, dur: number, meta?: Record<string, number | string>): void {
    if (!this.enabled || !this._currentFrame) return
    this._currentFrame.spans.push({
      name,
      start: performance.now() - dur, // approximate
      dur,
      depth: 0,
      thread: 'worker',
      meta,
    })
  }

  recordOneShot(name: string, dur: number, meta?: Record<string, number | string>): void {
    if (!this.enabled) return
    this._pendingOneShots.push({
      name,
      start: performance.now() - dur,
      dur,
      depth: 0,
      thread: 'main',
      meta,
    })
  }

  // ---- Ring buffer accessors ----

  getFrames(count?: number): FrameTrace[] {
    const frames: FrameTrace[] = []
    const max = count ?? RING_SIZE
    // Read from oldest to newest
    for (let i = 0; i < RING_SIZE && frames.length < max; i++) {
      const idx = (this._head - RING_SIZE + i + RING_SIZE * 2) % RING_SIZE
      const f = this._frames[idx]
      if (f) frames.push(f)
    }
    return frames
  }

  getLastFrame(): FrameTrace | null {
    const idx = (this._head - 1 + RING_SIZE) % RING_SIZE
    return this._frames[idx]
  }

  // ---- Aggregation ----

  getAggregates(windowSize = 120): SpanAggregate[] {
    const frames = this.getFrames(windowSize)
    if (frames.length === 0) return []

    // Collect durations per span name
    const spanDurations = new Map<string, number[]>()
    for (const frame of frames) {
      for (const span of frame.spans) {
        let arr = spanDurations.get(span.name)
        if (!arr) {
          arr = []
          spanDurations.set(span.name, arr)
        }
        arr.push(span.dur)
      }
    }

    const result: SpanAggregate[] = []
    for (const [name, durations] of spanDurations) {
      const sorted = [...durations].sort((a, b) => a - b)
      const count = sorted.length
      const avg = sorted.reduce((a, b) => a + b, 0) / count
      const p95Idx = Math.min(Math.floor(count * 0.95), count - 1)
      const p95 = sorted[p95Idx]
      const max = sorted[count - 1]
      const last = durations[durations.length - 1]
      result.push({ name, count, avg, p95, max, last })
    }

    // Sort by p95 descending
    result.sort((a, b) => b.p95 - a.p95)
    return result
  }

  // ---- Listeners ----

  subscribe(fn: FrameListener): () => void {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  }

  private _notifyListeners(): void {
    for (const fn of this._listeners) {
      fn()
    }
  }
}

export const profiler = new Profiler()
