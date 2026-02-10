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

