'use client'

/**
 * ProfilerOverlay - Span-based profiler UI (replaces DevPanel)
 *
 * Compact mode: FPS, frame ms, sparkline, node/edge counts
 * Expanded mode: Timeline, Hotspots, Renderer tabs
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { isDevMode } from '@/lib/devMode'
import { profiler, type FrameTrace, type SpanAggregate, type ProfilerMetrics } from '@/lib/profiler'

// ============================================
// Constants
// ============================================

const SPAN_COLORS: Record<string, string> = {
  'frame.render.gl': '#60a5fa', // blue-400
  'layout.repulsion': '#3b82f6', // blue-500
  'layout.springs': '#06b6d4',   // cyan-500
  'layout.center': '#8b5cf6',    // violet-500
  'layout.integrate': '#22c55e', // green-500
  'layout.radial.init': '#0ea5e9', // sky-500
  'layout.radial.step': '#0284c7', // sky-600
  'layout.radial.forces': '#0891b2', // cyan-600
  'layout.radial.integrate': '#10b981', // emerald-500
  'layout.hierarchical.init': '#a78bfa', // violet-400
  'layout.hierarchical.step': '#8b5cf6', // violet-500
  'layout.hierarchical.repulsion': '#7c3aed', // violet-600
  'edges.update': '#a855f7',     // purple-500
  'worker.layout.total': '#f59e0b',      // amber-500
  'worker.transfer.in': '#f59e0b', // amber-500
  'worker.layout.repulsion': '#f97316', // orange-500
  'worker.layout.springs': '#fb923c', // orange-400
  'worker.layout.center': '#facc15', // yellow-400
  'worker.layout.clustering': '#eab308', // yellow-500
  'worker.layout.integrate': '#84cc16', // lime-500
  'worker.serialize.positions': '#d97706', // amber-600
  'worker.transfer.out': '#b45309', // amber-700
  'worker.deserialize.positions': '#c2410c', // orange-700
  'graph.processGraph': '#f97316', // orange-500
  'graph.applyLens': '#ec4899',  // pink-500
}

const DEFAULT_SPAN_COLOR = '#6b7280' // gray-500
const BUDGET_MS = 16.67 // 60fps budget

function getSpanColor(name: string): string {
  return SPAN_COLORS[name] ?? DEFAULT_SPAN_COLOR
}

function getFpsColor(fps: number): string {
  if (fps >= 55) return '#22c55e'
  if (fps >= 30) return '#eab308'
  return '#ef4444'
}

function formatMs(ms: number): string {
  if (ms < 0.1) return '<0.1'
  if (ms < 1) return ms.toFixed(2)
  return ms.toFixed(1)
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

// ============================================
// Sparkline Component
// ============================================

function Sparkline({ frames, width = 120, height = 24 }: {
  frames: FrameTrace[]
  width?: number
  height?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || frames.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, width, height)

    const maxMs = Math.max(BUDGET_MS * 2, ...frames.map(f => f.dur))
    const barW = Math.max(1, width / frames.length)

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]
      const barH = Math.min(height, (f.dur / maxMs) * height)
      const x = i * barW

      // Color by budget
      if (f.dur > BUDGET_MS * 2) {
        ctx.fillStyle = '#ef4444' // red
      } else if (f.dur > BUDGET_MS) {
        ctx.fillStyle = '#eab308' // yellow
      } else {
        ctx.fillStyle = '#22c55e' // green
      }

      ctx.fillRect(x, height - barH, barW - (barW > 2 ? 1 : 0), barH)
    }

    // Budget line
    const budgetY = height - (BUDGET_MS / maxMs) * height
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 2])
    ctx.beginPath()
    ctx.moveTo(0, budgetY)
    ctx.lineTo(width, budgetY)
    ctx.stroke()
    ctx.setLineDash([])
  }, [frames, width, height])

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="rounded"
    />
  )
}

// ============================================
// Timeline Tab
// ============================================

function TimelineTab({ frames, onSelectFrame, selectedFrameIdx }: {
  frames: FrameTrace[]
  onSelectFrame: (idx: number | null) => void
  selectedFrameIdx: number | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || frames.length === 0) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const barW = rect.width / frames.length
    const idx = Math.floor(x / barW)
    if (idx >= 0 && idx < frames.length) {
      onSelectFrame(idx === selectedFrameIdx ? null : idx)
    }
  }, [frames, onSelectFrame, selectedFrameIdx])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || frames.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.parentElement?.clientWidth ?? 400
    const h = 80
    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, w, h)

    const maxMs = Math.max(BUDGET_MS * 2, ...frames.map(f => f.dur))
    const barW = Math.max(1, w / frames.length)

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]
      const totalH = Math.min(h, (f.dur / maxMs) * h)
      const x = i * barW

      // Selected frame highlight
      if (i === selectedFrameIdx) {
        ctx.fillStyle = 'rgba(255,255,255,0.1)'
        ctx.fillRect(x, 0, barW, h)
      }

      // Stack spans within the bar
      let yOffset = 0
      for (const span of f.spans) {
        const spanH = (span.dur / maxMs) * h
        ctx.fillStyle = getSpanColor(span.name)
        ctx.fillRect(x, h - yOffset - spanH, barW - (barW > 2 ? 1 : 0), spanH)
        yOffset += spanH
      }

      // Remainder (unaccounted frame time)
      const spannedMs = f.spans.reduce((sum, s) => sum + s.dur, 0)
      const remainderMs = Math.max(0, f.dur - spannedMs)
      if (remainderMs > 0.1) {
        const remH = (remainderMs / maxMs) * h
        ctx.fillStyle = DEFAULT_SPAN_COLOR
        ctx.fillRect(x, h - yOffset - remH, barW - (barW > 2 ? 1 : 0), remH)
      }
    }

    // Budget line
    const budgetY = h - (BUDGET_MS / maxMs) * h
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(0, budgetY)
    ctx.lineTo(w, budgetY)
    ctx.stroke()
    ctx.setLineDash([])

    // Budget label
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = '9px monospace'
    ctx.fillText('16.7ms', 2, budgetY - 2)
  }, [frames, selectedFrameIdx])

  const selectedFrame = selectedFrameIdx !== null ? frames[selectedFrameIdx] : null

  return (
    <div ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="w-full cursor-pointer rounded"
        onClick={handleClick}
      />
      {selectedFrame && (
        <div className="mt-1.5 space-y-0.5">
          <div className="text-white/50 text-[9px]">
            Frame #{selectedFrame.frameId} — {formatMs(selectedFrame.dur)}ms
          </div>
          {selectedFrame.spans
            .filter(s => s.dur > 0.01)
            .sort((a, b) => b.dur - a.dur)
            .map((span, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: getSpanColor(span.name) }}
                />
                <span className="text-white/70 flex-1 truncate">{span.name}</span>
                <span className="text-white/90 tabular-nums">{formatMs(span.dur)}ms</span>
                {span.thread === 'worker' && (
                  <span className="text-amber-400/60 text-[8px]">W</span>
                )}
              </div>
            ))}
          {/* Show unaccounted time */}
          {(() => {
            const spannedMs = selectedFrame.spans.reduce((sum, s) => sum + s.dur, 0)
            const remainderMs = Math.max(0, selectedFrame.dur - spannedMs)
            if (remainderMs < 0.1) return null
            return (
              <div className="flex items-center gap-1.5 text-white/40">
                <div className="w-2 h-2 rounded-sm flex-shrink-0 bg-gray-500" />
                <span className="flex-1 truncate">other</span>
                <span className="tabular-nums">{formatMs(remainderMs)}ms</span>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ============================================
// Hotspots Tab
// ============================================

function HotspotsTab({ aggregates }: { aggregates: SpanAggregate[] }) {
  const [sortKey, setSortKey] = useState<'selfP95' | 'p95' | 'avg' | 'max'>('selfP95')

  const sorted = useMemo(() => {
    return [...aggregates].sort((a, b) => b[sortKey] - a[sortKey])
  }, [aggregates, sortKey])

  return (
    <div>
      {/* Header */}
      <div className="flex gap-1 text-white/40 text-[9px] mb-1 px-0.5">
        <span className="flex-1">Span</span>
        <button
          className={`w-12 text-right ${sortKey === 'selfP95' ? 'text-white/80' : ''}`}
          onClick={() => setSortKey('selfP95')}
        >
          self95
        </button>
        <button
          className={`w-12 text-right ${sortKey === 'p95' ? 'text-white/80' : ''}`}
          onClick={() => setSortKey('p95')}
        >
          p95
        </button>
        <button
          className={`w-12 text-right ${sortKey === 'avg' ? 'text-white/80' : ''}`}
          onClick={() => setSortKey('avg')}
        >
          avg
        </button>
        <button
          className={`w-12 text-right ${sortKey === 'max' ? 'text-white/80' : ''}`}
          onClick={() => setSortKey('max')}
        >
          max
        </button>
        <span className="w-8 text-right">n</span>
      </div>
      {/* Rows */}
      <div className="space-y-px">
        {sorted.map((agg) => (
          <div
            key={agg.name}
            className={`flex gap-1 items-center px-0.5 rounded ${
              agg.selfP95 > 5 ? 'bg-red-500/10' : ''
            }`}
          >
            <div
              className="w-1.5 h-1.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: getSpanColor(agg.name) }}
            />
            <span className="flex-1 truncate text-white/70">{agg.name}</span>
            <span className="w-12 text-right tabular-nums text-white/80">
              {formatMs(agg.selfP95)}
            </span>
            <span className="w-12 text-right tabular-nums text-white/50">
              {formatMs(agg.p95)}
            </span>
            <span className="w-12 text-right tabular-nums text-white/60">
              {formatMs(agg.avg)}
            </span>
            <span className="w-12 text-right tabular-nums text-white/60">
              {formatMs(agg.max)}
            </span>
            <span className="w-8 text-right tabular-nums text-white/40">
              {agg.count}
            </span>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="text-white/30 text-center py-2">No data yet</div>
        )}
      </div>
    </div>
  )
}

// ============================================
// Renderer Tab
// ============================================

function RendererTab({ metrics }: { metrics: ProfilerMetrics }) {
  const stats = metrics.rendererStats

  return (
    <div className="space-y-0.5 text-white/50">
      <div className="flex justify-between">
        <span>Draw calls</span>
        <span className="text-white/70">{stats.drawCalls}</span>
      </div>
      <div className="flex justify-between">
        <span>Triangles</span>
        <span className="text-white/70">{formatNumber(stats.triangles)}</span>
      </div>
      <div className="flex justify-between">
        <span>Geometries</span>
        <span className="text-white/70">{stats.geometries}</span>
      </div>
      <div className="flex justify-between">
        <span>Textures</span>
        <span className="text-white/70">{stats.textures}</span>
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-white/10 flex justify-between text-white/40">
        <span>{metrics.nodeCount} nodes</span>
        <span>{metrics.edgeCount} edges</span>
      </div>
      {metrics.stableFrames > 60 && (
        <div className="text-green-400/70 text-[9px] text-center mt-1">
          STABLE ({metrics.stableFrames} frames)
        </div>
      )}
    </div>
  )
}

// ============================================
// Main ProfilerOverlay
// ============================================

interface ProfilerOverlayProps {
  className?: string
}

export default function ProfilerOverlay({ className = '' }: ProfilerOverlayProps) {
  const [enabled, setEnabled] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'timeline' | 'hotspots' | 'renderer'>('timeline')
  const [frozen, setFrozen] = useState(false)
  const [tick, setTick] = useState(0)
  const [selectedFrameIdx, setSelectedFrameIdx] = useState<number | null>(null)

  // Poll for devMode changes
  useEffect(() => {
    setEnabled(isDevMode())
    const interval = setInterval(() => setEnabled(isDevMode()), 500)
    return () => clearInterval(interval)
  }, [])

  // Subscribe to profiler updates
  useEffect(() => {
    if (!enabled || frozen) return
    return profiler.subscribe(() => {
      setTick(t => t + 1)
    })
  }, [enabled, frozen])

  // Derive data from profiler (re-computed on tick)
  const frames = useMemo(() => profiler.getFrames(), [tick])
  const lastFrame = frames.length > 0 ? frames[frames.length - 1] : null
  const metrics = useMemo(
    () => lastFrame?.metrics ?? profiler.getLatestMetrics(),
    [lastFrame, tick]
  )
  const fps = lastFrame && lastFrame.dur > 0 ? Math.round(1000 / lastFrame.dur) : 0
  const aggregates = useMemo(() => profiler.getAggregates(120), [tick])

  // Top physics span for compact display
  const topSpanMs = useMemo(() => {
    if (!lastFrame) return 0
    const layoutSpans = lastFrame.spans.filter(s => s.name.startsWith('layout.'))
    return layoutSpans.reduce((sum, s) => sum + s.dur, 0)
  }, [lastFrame])

  const handleCopyJson = useCallback(() => {
    const data = profiler.getFrames(240)
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
  }, [])

  if (!enabled) return null

  // Compact sparkline frames (last 120)
  const sparklineFrames = frames.slice(-120)

  return (
    <div
      className={`font-mono text-[10px] leading-tight bg-black/80 text-white/90 rounded border border-white/10 select-none ${className}`}
      style={{ minWidth: expanded ? 360 : 240, maxWidth: expanded ? 520 : 360 }}
    >
      {/* Compact header (always visible) */}
      <div
        className="p-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 min-w-[78px]">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: getFpsColor(fps) }}
            />
            <span className="text-white font-semibold" style={{ fontSize: 14 }}>
              {fps}
            </span>
            <span className="text-white/50">FPS</span>
          </div>

          {lastFrame && (
            <span className="text-white/40 tabular-nums min-w-[44px]">
              {formatMs(lastFrame.dur)}ms
            </span>
          )}

          <Sparkline frames={sparklineFrames} width={expanded ? 220 : 140} height={20} />

          <div className="flex flex-col text-[9px] text-white/40 text-right min-w-[54px]">
            <span>{metrics.nodeCount}n/{metrics.edgeCount}e</span>
            <span>{topSpanMs > 0 ? `phys ${formatMs(topSpanMs)}ms` : '-'}</span>
          </div>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-white/10">
          {/* Tab bar + controls */}
          <div className="flex items-center gap-1 px-2 py-1 border-b border-white/10">
            {(['timeline', 'hotspots', 'renderer'] as const).map(tab => (
              <button
                key={tab}
                className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                  activeTab === tab
                    ? 'bg-white/20 text-white'
                    : 'text-white/40 hover:text-white/60'
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
            <div className="flex-1" />
            <button
              className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                frozen ? 'bg-amber-500/30 text-amber-300' : 'text-white/40 hover:text-white/60'
              }`}
              onClick={() => setFrozen(!frozen)}
              title={frozen ? 'Resume' : 'Freeze'}
            >
              {frozen ? '▶' : '⏸'}
            </button>
            <button
              className="px-1.5 py-0.5 rounded text-[9px] text-white/40 hover:text-white/60 transition-colors"
              onClick={handleCopyJson}
              title="Copy traces as JSON"
            >
              copy
            </button>
          </div>

          {/* Tab content */}
          <div className="p-2 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
            {activeTab === 'timeline' && (
              <TimelineTab
                frames={frames}
                onSelectFrame={setSelectedFrameIdx}
                selectedFrameIdx={selectedFrameIdx}
              />
            )}
            {activeTab === 'hotspots' && (
              <HotspotsTab aggregates={aggregates} />
            )}
            {activeTab === 'renderer' && (
              <RendererTab metrics={metrics} />
            )}
          </div>

          {/* Span color legend */}
          {activeTab === 'timeline' && (
            <div className="px-2 pb-1.5 flex flex-wrap gap-x-2 gap-y-0.5 border-t border-white/10 pt-1">
              {Object.entries(SPAN_COLORS).map(([name, color]) => (
                <div key={name} className="flex items-center gap-0.5 text-[8px] text-white/40">
                  <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: color }} />
                  {(() => {
                    const parts = name.split('.')
                    if (parts.length >= 3) return `${parts[1]}.${parts[2]}`
                    return parts[1] || name
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
