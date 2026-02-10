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

export interface RendererStats {
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
}

export interface ProfilerMetrics {
  nodeCount: number
  edgeCount: number
  stableFrames: number
  rendererStats: RendererStats
}

export interface ProfilerMetricsUpdate {
  nodeCount?: number
  edgeCount?: number
  stableFrames?: number
  rendererStats?: Partial<RendererStats>
}

export interface FrameTrace {
  frameId: number
  start: number       // performance.now() at frame begin
  dur: number         // total frame duration
  spans: SpanEvent[]
  metrics: ProfilerMetrics
}

export interface SpanAggregate {
  name: string
  count: number
  avg: number
  p95: number
  max: number
  last: number
  selfAvg: number
  selfP95: number
  selfMax: number
  selfLast: number
}

// ============================================
// Profiler
// ============================================

const RING_SIZE = 240 // ~4s at 60fps
const NOTIFY_INTERVAL = 8 // notify listeners every N frames
const MAX_PENDING_ONE_SHOTS = 1024 // cap to avoid unbounded growth when frames are paused

type FrameListener = () => void
type SpanMeta = Record<string, number | string>
type SpanMetaInput = SpanMeta | (() => SpanMeta | undefined)

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

  // Latest metrics snapshot (observational, populated by recordMetrics)
  private _latestMetrics: ProfilerMetrics = {
    nodeCount: 0,
    edgeCount: 0,
    stableFrames: 0,
    rendererStats: { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 },
  }

  // Listeners
  private _listeners = new Set<FrameListener>()

  private _cloneMetrics(metrics: ProfilerMetrics): ProfilerMetrics {
    return {
      nodeCount: metrics.nodeCount,
      edgeCount: metrics.edgeCount,
      stableFrames: metrics.stableFrames,
      rendererStats: {
        drawCalls: metrics.rendererStats.drawCalls,
        triangles: metrics.rendererStats.triangles,
        geometries: metrics.rendererStats.geometries,
        textures: metrics.rendererStats.textures,
      },
    }
  }

  // ---- Metrics API ----

  recordMetrics(update: ProfilerMetricsUpdate): void {
    if (!this.enabled) return

    if (update.nodeCount !== undefined) this._latestMetrics.nodeCount = update.nodeCount
    if (update.edgeCount !== undefined) this._latestMetrics.edgeCount = update.edgeCount
    if (update.stableFrames !== undefined) this._latestMetrics.stableFrames = update.stableFrames

    const renderer = update.rendererStats
    if (renderer) {
      if (renderer.drawCalls !== undefined) this._latestMetrics.rendererStats.drawCalls = renderer.drawCalls
      if (renderer.triangles !== undefined) this._latestMetrics.rendererStats.triangles = renderer.triangles
      if (renderer.geometries !== undefined) this._latestMetrics.rendererStats.geometries = renderer.geometries
      if (renderer.textures !== undefined) this._latestMetrics.rendererStats.textures = renderer.textures
    }

    if (this._currentFrame) {
      this._currentFrame.metrics = this._cloneMetrics(this._latestMetrics)
    }
  }

  getLatestMetrics(): ProfilerMetrics {
    return this._cloneMetrics(this._latestMetrics)
  }

  // ---- Frame lifecycle ----

  beginFrame(): void {
    if (!this.enabled) return
    const now = performance.now()
    this._currentFrame = {
      frameId: this._frameCount++,
      start: now,
      dur: 0,
      spans: [],
      metrics: this._cloneMetrics(this._latestMetrics),
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

  span<T>(name: string, fn: () => T, meta?: SpanMetaInput): T {
    if (!this.enabled || !this._currentFrame) return fn()
    const depth = this._spanDepth
    this._spanDepth++
    const start = performance.now()
    try {
      return fn()
    } finally {
      const dur = performance.now() - start
      const resolvedMeta = typeof meta === 'function' ? meta() : meta
      this._currentFrame!.spans.push({ name, start, dur, depth, thread: 'main', meta: resolvedMeta })
      this._spanDepth--
    }
  }

  pushWorkerSpan(name: string, dur: number, meta?: Record<string, number | string>): void {
    if (!this.enabled) return
    const span: SpanEvent = {
      name,
      start: performance.now() - dur, // approximate
      dur,
      depth: 0,
      thread: 'worker',
      meta,
    }
    if (this._currentFrame) {
      this._currentFrame.spans.push(span)
      return
    }
    // If worker events arrive outside frame bounds, flush into the next frame.
    this._pendingOneShots.push(span)
    if (this._pendingOneShots.length > MAX_PENDING_ONE_SHOTS) {
      this._pendingOneShots.splice(0, this._pendingOneShots.length - MAX_PENDING_ONE_SHOTS)
    }
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
    if (this._pendingOneShots.length > MAX_PENDING_ONE_SHOTS) {
      this._pendingOneShots.splice(0, this._pendingOneShots.length - MAX_PENDING_ONE_SHOTS)
    }
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

    // Collect total and exclusive durations per span name.
    const spanDurations = new Map<string, number[]>()
    const spanSelfDurations = new Map<string, number[]>()
    for (const frame of frames) {
      const selfDurations = this._computeSelfDurations(frame.spans)
      for (let i = 0; i < frame.spans.length; i++) {
        const span = frame.spans[i]
        let totalArr = spanDurations.get(span.name)
        if (!totalArr) {
          totalArr = []
          spanDurations.set(span.name, totalArr)
        }
        totalArr.push(span.dur)

        let selfArr = spanSelfDurations.get(span.name)
        if (!selfArr) {
          selfArr = []
          spanSelfDurations.set(span.name, selfArr)
        }
        selfArr.push(selfDurations[i])
      }
    }

    const calcStats = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b)
      const count = sorted.length
      const avg = sorted.reduce((a, b) => a + b, 0) / count
      const p95Idx = Math.min(Math.floor(count * 0.95), count - 1)
      const p95 = sorted[p95Idx]
      const max = sorted[count - 1]
      const last = values[values.length - 1]
      return { count, avg, p95, max, last }
    }

    const result: SpanAggregate[] = []
    for (const [name, totalValues] of spanDurations) {
      const selfValues = spanSelfDurations.get(name) ?? totalValues
      const totalStats = calcStats(totalValues)
      const selfStats = calcStats(selfValues)
      result.push({
        name,
        count: totalStats.count,
        avg: totalStats.avg,
        p95: totalStats.p95,
        max: totalStats.max,
        last: totalStats.last,
        selfAvg: selfStats.avg,
        selfP95: selfStats.p95,
        selfMax: selfStats.max,
        selfLast: selfStats.last,
      })
    }

    // Sort by exclusive p95 descending (most actionable for nested spans).
    result.sort((a, b) => b.selfP95 - a.selfP95)
    return result
  }

  private _computeSelfDurations(spans: SpanEvent[]): number[] {
    const selfDurations = spans.map((s) => s.dur)
    const EPS = 1e-3

    const mainSpans = spans
      .map((span, idx) => ({ span, idx, end: span.start + span.dur }))
      .filter((entry) => entry.span.thread === 'main')
      .sort((a, b) => {
        if (a.span.start !== b.span.start) return a.span.start - b.span.start
        if (a.span.depth !== b.span.depth) return a.span.depth - b.span.depth
        return b.span.dur - a.span.dur
      })

    const stack: Array<{ idx: number; depth: number; end: number }> = []

    for (const entry of mainSpans) {
      while (stack.length > 0) {
        const top = stack[stack.length - 1]
        const isAfterTop = entry.span.start >= top.end - EPS
        const isNotDeeper = entry.span.depth <= top.depth
        const exceedsTop = entry.end > top.end + EPS
        if (!isAfterTop && !isNotDeeper && !exceedsTop) break
        stack.pop()
      }

      if (stack.length > 0) {
        const parent = stack[stack.length - 1]
        selfDurations[parent.idx] -= entry.span.dur
      }

      stack.push({ idx: entry.idx, depth: entry.span.depth, end: entry.end })
    }

    for (let i = 0; i < selfDurations.length; i++) {
      if (selfDurations[i] < 0) selfDurations[i] = 0
    }

    return selfDurations
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
