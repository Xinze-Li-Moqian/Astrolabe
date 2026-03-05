import { afterEach, describe, expect, it, vi } from 'vitest'
import { Profiler } from '../profiler'

function mockNow(sequence: number[]) {
  let idx = 0
  return vi.spyOn(performance, 'now').mockImplementation(() => {
    const v = sequence[Math.min(idx, sequence.length - 1)]
    idx++
    return v
  })
}

describe('Profiler aggregates', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('computes exclusive (self) durations for nested spans', () => {
    // Calls: beginFrame, parent.start, child.start, child.end, parent.end, endFrame
    mockNow([0, 1, 2, 5, 8, 10])

    const profiler = new Profiler()
    profiler.enabled = true

    profiler.beginFrame()
    profiler.span('parent', () => {
      profiler.span('child', () => {})
    })
    profiler.endFrame()

    const aggregates = profiler.getAggregates(1)
    const parent = aggregates.find((a) => a.name === 'parent')
    const child = aggregates.find((a) => a.name === 'child')

    expect(parent).toBeDefined()
    expect(child).toBeDefined()
    expect(parent!.p95).toBeCloseTo(7, 6)
    expect(parent!.selfP95).toBeCloseTo(4, 6)
    expect(child!.p95).toBeCloseTo(3, 6)
    expect(child!.selfP95).toBeCloseTo(3, 6)
  })

  it('keeps sibling span self duration equal to total duration', () => {
    // Calls: beginFrame, a.start, a.end, b.start, b.end, endFrame
    mockNow([0, 1, 3, 4, 7, 8])

    const profiler = new Profiler()
    profiler.enabled = true

    profiler.beginFrame()
    profiler.span('a', () => {})
    profiler.span('b', () => {})
    profiler.endFrame()

    const aggregates = profiler.getAggregates(1)
    const a = aggregates.find((x) => x.name === 'a')
    const b = aggregates.find((x) => x.name === 'b')

    expect(a).toBeDefined()
    expect(b).toBeDefined()
    expect(a!.selfP95).toBeCloseTo(a!.p95, 6)
    expect(b!.selfP95).toBeCloseTo(b!.p95, 6)
  })

  it('sorts aggregates by exclusive p95 descending', () => {
    // Calls: beginFrame, parent.start, child.start, child.end, parent.end, endFrame
    // parent total = 11, child total = 9, parent self = 2 => child should rank first by selfP95.
    mockNow([0, 1, 2, 11, 12, 13])

    const profiler = new Profiler()
    profiler.enabled = true

    profiler.beginFrame()
    profiler.span('parent', () => {
      profiler.span('child', () => {})
    })
    profiler.endFrame()

    const aggregates = profiler.getAggregates(1)
    expect(aggregates.length).toBeGreaterThanOrEqual(2)
    expect(aggregates[0].name).toBe('child')
    expect(aggregates[0].selfP95).toBeGreaterThan(aggregates[1].selfP95)
  })
})

describe('Profiler metrics and invariants', () => {
  it('uses span fast path when disabled and does not evaluate lazy meta', () => {
    const profiler = new Profiler()
    let fnCalls = 0
    let metaCalls = 0

    const result = profiler.span('disabled.span', () => {
      fnCalls++
      return 42
    }, () => {
      metaCalls++
      return { key: 'value' }
    })

    expect(result).toBe(42)
    expect(fnCalls).toBe(1)
    expect(metaCalls).toBe(0)
    expect(profiler.getFrames().length).toBe(0)
  })

  it('caps pending one-shots to avoid unbounded growth', () => {
    const profiler = new Profiler()
    profiler.enabled = true

    for (let i = 0; i < 1100; i++) {
      profiler.recordOneShot(`oneshot.${i}`, 0.01)
    }

    profiler.beginFrame()
    profiler.endFrame()

    const last = profiler.getLastFrame()
    expect(last).not.toBeNull()
    // MAX_PENDING_ONE_SHOTS in profiler.ts
    expect(last!.spans.length).toBeLessThanOrEqual(1024)
  })

  it('records metrics as frame snapshots', () => {
    const profiler = new Profiler()
    profiler.enabled = true

    profiler.beginFrame()
    profiler.recordMetrics({
      nodeCount: 12,
      edgeCount: 34,
      stableFrames: 5,
      rendererStats: {
        drawCalls: 7,
        triangles: 1234,
        geometries: 8,
        textures: 9,
      },
    })
    profiler.endFrame()

    const latest = profiler.getLatestMetrics()
    expect(latest.nodeCount).toBe(12)
    expect(latest.edgeCount).toBe(34)
    expect(latest.stableFrames).toBe(5)
    expect(latest.rendererStats.drawCalls).toBe(7)

    const lastFrame = profiler.getLastFrame()
    expect(lastFrame).not.toBeNull()
    expect(lastFrame!.metrics.nodeCount).toBe(12)
    expect(lastFrame!.metrics.rendererStats.triangles).toBe(1234)
  })

  it('keeps deterministic layout math identical with profiling enabled/disabled', () => {
    const runDeterministicStep = (enabled: boolean) => {
      const profiler = new Profiler()
      profiler.enabled = enabled

      const positions = new Map<string, [number, number, number]>([
        ['a', [0, 0, 0]],
        ['b', [10, 0, 0]],
      ])
      const velocities = new Map<string, [number, number, number]>([
        ['a', [0, 0, 0]],
        ['b', [0, 0, 0]],
      ])
      const dt = 0.016

      profiler.beginFrame()
      profiler.span('layout.test.step', () => {
        const forces = profiler.span('layout.test.forces', () => {
          const next = new Map<string, [number, number, number]>([
            ['a', [0, 0, 0]],
            ['b', [0, 0, 0]],
          ])
          const pA = positions.get('a')!
          const pB = positions.get('b')!
          const dx = pB[0] - pA[0]
          const dist = Math.max(0.1, Math.abs(dx))
          const springForce = (dist - 8) * 0.5
          next.get('a')![0] += springForce
          next.get('b')![0] -= springForce
          return next
        })

        profiler.span('layout.test.integrate', () => {
          for (const id of ['a', 'b']) {
            const vel = velocities.get(id)!
            const force = forces.get(id)!
            const pos = positions.get(id)!
            vel[0] = (vel[0] + force[0] * dt) * 0.8
            pos[0] += vel[0] * dt
          }
        })

        profiler.recordMetrics({
          nodeCount: positions.size,
          edgeCount: 1,
          stableFrames: 0,
        })
      })
      profiler.endFrame()

      return {
        positions: Array.from(positions.entries()),
        velocities: Array.from(velocities.entries()),
      }
    }

    expect(runDeterministicStep(true)).toEqual(runDeterministicStep(false))
  })
})
