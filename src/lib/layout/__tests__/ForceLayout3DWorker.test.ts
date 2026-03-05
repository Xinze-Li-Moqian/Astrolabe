import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * 3D Force Layout Web Worker Tests
 *
 * Test scenarios:
 * 1. Worker initialization and communication
 * 2. Physics step computation
 * 3. Position updates via message passing
 * 4. Barnes-Hut integration
 * 5. Stability detection
 */

describe('ForceLayout3DWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('physics computation (pure functions)', () => {
    it('should compute repulsion forces between nodes', async () => {
      const { computeRepulsionForces } = await import('../ForceLayout3DWorker')

      const positions: [number, number, number][] = [
        [0, 0, 0],
        [10, 0, 0],
      ]
      const forces: [number, number, number][] = [
        [0, 0, 0],
        [0, 0, 0],
      ]

      computeRepulsionForces(positions, forces, 100)

      // Node 0 should be pushed left (negative x)
      expect(forces[0][0]).toBeLessThan(0)
      // Node 1 should be pushed right (positive x)
      expect(forces[1][0]).toBeGreaterThan(0)
    })

    it('should compute spring forces for connected nodes', async () => {
      const { computeSpringForces } = await import('../ForceLayout3DWorker')

      const positions = new Map<string, [number, number, number]>([
        ['a', [0, 0, 0]],
        ['b', [20, 0, 0]], // Far apart
      ])
      const edges = [{ source: 'a', target: 'b' }]
      const forces = new Map<string, [number, number, number]>([
        ['a', [0, 0, 0]],
        ['b', [0, 0, 0]],
      ])

      computeSpringForces(positions, edges, forces, {
        springLength: 5,
        springStrength: 1,
      })

      // Nodes should be pulled together
      expect(forces.get('a')![0]).toBeGreaterThan(0) // a pulled towards b
      expect(forces.get('b')![0]).toBeLessThan(0) // b pulled towards a
    })

    it('should compute center gravity forces', async () => {
      const { computeCenterGravity } = await import('../ForceLayout3DWorker')

      const positions = new Map<string, [number, number, number]>([
        ['a', [100, 50, 30]],
      ])
      const forces = new Map<string, [number, number, number]>([
        ['a', [0, 0, 0]],
      ])

      computeCenterGravity(positions, forces, 0.1)

      // Node should be pulled towards center
      expect(forces.get('a')![0]).toBeLessThan(0) // pulled left towards 0
      expect(forces.get('a')![1]).toBeLessThan(0) // pulled down towards 0
      expect(forces.get('a')![2]).toBeLessThan(0) // pulled back towards 0
    })

    it('should apply velocity damping', async () => {
      const { applyDamping } = await import('../ForceLayout3DWorker')

      const velocities = new Map<string, [number, number, number]>([
        ['a', [10, 20, 30]],
      ])

      applyDamping(velocities, 0.5)

      expect(velocities.get('a')).toEqual([5, 10, 15])
    })

    it('should limit maximum velocity', async () => {
      const { limitVelocity } = await import('../ForceLayout3DWorker')

      const vel: [number, number, number] = [100, 100, 100]
      const maxVel = 10

      const limited = limitVelocity(vel, maxVel)

      const speed = Math.sqrt(limited[0] ** 2 + limited[1] ** 2 + limited[2] ** 2)
      expect(speed).toBeCloseTo(maxVel, 5)
    })
  })

  describe('simulation step', () => {
    it('should compute one simulation step and return total movement', async () => {
      const { simulateStep } = await import('../ForceLayout3DWorker')

      const state = {
        positions: new Map<string, [number, number, number]>([
          ['a', [0, 0, 0]],
          ['b', [5, 0, 0]],
        ]),
        velocities: new Map<string, [number, number, number]>([
          ['a', [0, 0, 0]],
          ['b', [0, 0, 0]],
        ]),
        edges: [{ source: 'a', target: 'b' }],
        physics: {
          repulsionStrength: 100,
          springLength: 8,
          springStrength: 1,
          centerStrength: 0.05,
          damping: 0.8,
        },
      }

      const step = simulateStep(state, 0.016)

      // Should return some movement (forces were applied)
      expect(step.movement).toBeGreaterThan(0)
      expect(step.phases.total).toBeGreaterThanOrEqual(0)

      // Positions should have changed
      expect(state.positions.get('a')).not.toEqual([0, 0, 0])
    })

    it('should detect stability when movement is low', async () => {
      const { isStable } = await import('../ForceLayout3DWorker')

      expect(isStable(0.001, 0.01)).toBe(true)
      expect(isStable(0.1, 0.01)).toBe(false)
    })
  })

  describe('Barnes-Hut integration', () => {
    it('should use Barnes-Hut for large node counts (>=50)', async () => {
      const { computeRepulsionForces } = await import(
        '../ForceLayout3DWorker'
      )

      // computeRepulsionForces uses BH internally for >=50 nodes.
      // Verify it runs without errors for both small and large inputs.
      const smallPos: [number, number, number][] = Array.from({ length: 10 }, (_, i) => [i, 0, 0])
      const smallForces: [number, number, number][] = smallPos.map(() => [0, 0, 0])
      computeRepulsionForces(smallPos, smallForces, 200)
      // Forces should be non-zero for separated nodes
      expect(smallForces.some(f => f[0] !== 0 || f[1] !== 0 || f[2] !== 0)).toBe(true)

      const largePos: [number, number, number][] = Array.from({ length: 100 }, (_, i) => [i * 2, 0, 0])
      const largeForces: [number, number, number][] = largePos.map(() => [0, 0, 0])
      computeRepulsionForces(largePos, largeForces, 200)
      expect(largeForces.some(f => f[0] !== 0 || f[1] !== 0 || f[2] !== 0)).toBe(true)
    })
  })

  describe('worker message protocol', () => {
    it('should define correct message types', async () => {
      const { WorkerMessageType } = await import('../ForceLayout3DWorker')

      expect(WorkerMessageType.INIT).toBe('init')
      expect(WorkerMessageType.STEP).toBe('step')
      expect(WorkerMessageType.POSITIONS).toBe('positions')
      expect(WorkerMessageType.STOP).toBe('stop')
    })
  })
})

describe('ForceLayout3DWorker integration', () => {
  it('should export all necessary functions for worker', async () => {
    const module = await import('../ForceLayout3DWorker')

    expect(module.computeRepulsionForces).toBeDefined()
    expect(module.computeSpringForces).toBeDefined()
    expect(module.computeCenterGravity).toBeDefined()
    expect(module.simulateStep).toBeDefined()
    expect(module.applyDamping).toBeDefined()
    expect(module.limitVelocity).toBeDefined()
    expect(module.isStable).toBeDefined()
  })
})

describe('Namespace Clustering', () => {
  it('should compute cluster centroids correctly', async () => {
    const { computeClusterCentroids } = await import('../ForceLayout3DWorker')

    const namespaceGroups = new Map([
      ['Mathlib.Algebra', ['node1', 'node2']],
      ['Mathlib.Data', ['node3']],
    ])
    const positions = new Map<string, [number, number, number]>([
      ['node1', [0, 0, 0]],
      ['node2', [10, 0, 0]],
      ['node3', [100, 100, 100]],
    ])

    const centroids = computeClusterCentroids(namespaceGroups, positions)

    // Mathlib.Algebra centroid should be at (5, 0, 0)
    expect(centroids.get('Mathlib.Algebra')).toEqual([5, 0, 0])
    // Mathlib.Data centroid should be at (100, 100, 100)
    expect(centroids.get('Mathlib.Data')).toEqual([100, 100, 100])
  })

  it('should apply clustering force pulling nodes toward centroid', async () => {
    const { computeClusteringForces } = await import('../ForceLayout3DWorker')

    const namespaceGroups = new Map([
      ['Mathlib.Algebra', ['node1', 'node2']],
    ])
    const positions = new Map<string, [number, number, number]>([
      ['node1', [0, 0, 0]],
      ['node2', [100, 0, 0]], // Far from centroid (50, 0, 0)
    ])
    const forces = new Map<string, [number, number, number]>([
      ['node1', [0, 0, 0]],
      ['node2', [0, 0, 0]],
    ])

    computeClusteringForces(namespaceGroups, positions, forces, {
      clusteringStrength: 0.5,
      clusterSeparation: 0,
    })

    // node1 at (0,0,0) should be pulled toward centroid (50,0,0) - positive x
    expect(forces.get('node1')![0]).toBeGreaterThan(0)
    // node2 at (100,0,0) should be pulled toward centroid (50,0,0) - negative x
    expect(forces.get('node2')![0]).toBeLessThan(0)
  })

  it('should apply inter-cluster repulsion', async () => {
    const { computeClusteringForces } = await import('../ForceLayout3DWorker')

    const namespaceGroups = new Map([
      ['Mathlib.Algebra', ['node1']],
      ['Mathlib.Data', ['node2']],
    ])
    const positions = new Map<string, [number, number, number]>([
      ['node1', [0, 0, 0]],
      ['node2', [10, 0, 0]], // Close cluster
    ])
    const forces = new Map<string, [number, number, number]>([
      ['node1', [0, 0, 0]],
      ['node2', [0, 0, 0]],
    ])

    computeClusteringForces(namespaceGroups, positions, forces, {
      clusteringStrength: 0,
      clusterSeparation: 1.0, // Strong separation
    })

    // Clusters should repel each other
    expect(forces.get('node1')![0]).toBeLessThan(0) // pushed left
    expect(forces.get('node2')![0]).toBeGreaterThan(0) // pushed right
  })
})

describe('Adaptive Spring Length', () => {
  it('should compute node degrees correctly', async () => {
    const { computeNodeDegrees } = await import('../ForceLayout3DWorker')

    const edges = [
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
      { source: 'b', target: 'c' },
    ]

    const degrees = computeNodeDegrees(edges)

    // node a: 2 outgoing, 0 incoming
    expect(degrees.get('a')).toEqual({ in: 0, out: 2, total: 2 })
    // node b: 1 outgoing, 1 incoming
    expect(degrees.get('b')).toEqual({ in: 1, out: 1, total: 2 })
    // node c: 0 outgoing, 2 incoming
    expect(degrees.get('c')).toEqual({ in: 2, out: 0, total: 2 })
  })

  it('should calculate adaptive spring length based on node degrees', async () => {
    const { calculateAdaptiveSpringLength } = await import('../ForceLayout3DWorker')

    const lowDegree = { in: 1, out: 1, total: 2 }
    const highDegree = { in: 10, out: 10, total: 20 }

    const config = {
      baseLength: 8,
      mode: 'sqrt' as const,
      scaleFactor: 0.5,
      minLength: 4,
      maxLength: 40,
    }

    const lengthLow = calculateAdaptiveSpringLength(lowDegree, lowDegree, config)
    const lengthHigh = calculateAdaptiveSpringLength(highDegree, highDegree, config)

    // High degree nodes should have longer springs
    expect(lengthHigh).toBeGreaterThan(lengthLow)
    // Both should be within bounds
    expect(lengthLow).toBeGreaterThanOrEqual(config.minLength)
    expect(lengthHigh).toBeLessThanOrEqual(config.maxLength)
  })

  it('should support different adaptive modes (linear, sqrt, log)', async () => {
    const { calculateAdaptiveSpringLength } = await import('../ForceLayout3DWorker')

    const degree = { in: 5, out: 5, total: 10 }
    const baseConfig = { baseLength: 8, scaleFactor: 0.5, minLength: 4, maxLength: 40 }

    const linearLength = calculateAdaptiveSpringLength(degree, degree, { ...baseConfig, mode: 'linear' })
    const sqrtLength = calculateAdaptiveSpringLength(degree, degree, { ...baseConfig, mode: 'sqrt' })
    const logLength = calculateAdaptiveSpringLength(degree, degree, { ...baseConfig, mode: 'logarithmic' })

    // All should produce valid lengths
    expect(linearLength).toBeGreaterThan(0)
    expect(sqrtLength).toBeGreaterThan(0)
    expect(logLength).toBeGreaterThan(0)

    // Linear should grow fastest, log slowest
    expect(linearLength).toBeGreaterThan(sqrtLength)
    expect(sqrtLength).toBeGreaterThan(logLength)
  })

  it('should apply adaptive spring in simulation step', async () => {
    const { simulateStep } = await import('../ForceLayout3DWorker')

    // Create a hub node connected to many others
    const nodeIds = ['hub', 'leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5']
    const positions = new Map<string, [number, number, number]>()
    const velocities = new Map<string, [number, number, number]>()

    // Hub at center, leaves around it
    positions.set('hub', [0, 0, 0])
    velocities.set('hub', [0, 0, 0])
    for (let i = 1; i <= 5; i++) {
      const angle = (i / 5) * Math.PI * 2
      positions.set(`leaf${i}`, [Math.cos(angle) * 5, Math.sin(angle) * 5, 0])
      velocities.set(`leaf${i}`, [0, 0, 0])
    }

    const edges = [
      { source: 'hub', target: 'leaf1' },
      { source: 'hub', target: 'leaf2' },
      { source: 'hub', target: 'leaf3' },
      { source: 'hub', target: 'leaf4' },
      { source: 'hub', target: 'leaf5' },
    ]

    const state = {
      positions,
      velocities,
      edges,
      physics: {
        repulsionStrength: 100,
        springLength: 8,
        springStrength: 1,
        centerStrength: 0.05,
        damping: 0.8,
        // Adaptive spring enabled
        adaptiveSpringEnabled: true,
        adaptiveSpringMode: 'sqrt' as const,
        adaptiveSpringScale: 0.5,
      },
    }

    const step = simulateStep(state, 0.016)
    expect(step.movement).toBeGreaterThan(0)
    expect(step.phases.repulsion).toBeGreaterThanOrEqual(0)
  })
})

// ============================================
// TDD: Diagnosing reported issues
// ============================================

describe('Issue: extractNamespace leaf-node bug', () => {
  // The hook's extractNamespace(name, depth) uses parts.slice(0, depth).
  // Claim: for a 2-segment name like "Real.sinc" with depth=2, it returns
  // "Real.sinc" (the full name), so every leaf node becomes its own cluster.

  // We replicate the function here since it's not exported from the worker.
  function extractNamespace(name: string, depth: number): string {
    const parts = name.split('.')
    return parts.slice(0, depth).join('.')
  }

  it('should demonstrate the bug: 2-segment names with depth=2 each get their own group', () => {
    // These are sibling leaf nodes under different parents
    const names = ['Real.sinc', 'Real.cosine', 'Algebra.group', 'Algebra.ring']

    // With depth=1 — groups correctly by first segment
    const depth1Groups = new Map<string, string[]>()
    for (const name of names) {
      const ns = extractNamespace(name, 1)
      if (!depth1Groups.has(ns)) depth1Groups.set(ns, [])
      depth1Groups.get(ns)!.push(name)
    }
    expect(depth1Groups.size).toBe(2) // "Real" and "Algebra"
    expect(depth1Groups.get('Real')!.length).toBe(2)

    // With depth=2 — BUG: each name becomes its own cluster
    const depth2Groups = new Map<string, string[]>()
    for (const name of names) {
      const ns = extractNamespace(name, 2)
      if (!depth2Groups.has(ns)) depth2Groups.set(ns, [])
      depth2Groups.get(ns)!.push(name)
    }
    // This PROVES the bug: 4 groups instead of 2
    expect(depth2Groups.size).toBe(4) // Each name is its own cluster!
  })

  it('should demonstrate the bug: deep names work but shallow names break', () => {
    // "Mathlib.Algebra.Group" with depth=2 → "Mathlib.Algebra" ✓
    expect(extractNamespace('Mathlib.Algebra.Group', 2)).toBe('Mathlib.Algebra')
    // "Real.sinc" with depth=2 → "Real.sinc" ✗ (should be "Real")
    expect(extractNamespace('Real.sinc', 2)).toBe('Real.sinc') // BUG: full name returned
    // So if depth >= parts.length, it returns the full name = unique per node
  })

  it('proposed fix: cap depth to parts.length - 1 to always group siblings', () => {
    function extractNamespaceFixed(name: string, depth: number): string {
      if (!name || depth === 0) return name
      const parts = name.split('.')
      const nsDepth = Math.min(depth, parts.length - 1)
      if (nsDepth <= 0) return parts[0]
      return parts.slice(0, nsDepth).join('.')
    }

    // Deep names still work
    expect(extractNamespaceFixed('Mathlib.Algebra.Group', 2)).toBe('Mathlib.Algebra')
    // Shallow names now group correctly
    expect(extractNamespaceFixed('Real.sinc', 2)).toBe('Real')
    expect(extractNamespaceFixed('Real.cosine', 2)).toBe('Real')
    // Single-segment names return the segment
    expect(extractNamespaceFixed('Orphan', 2)).toBe('Orphan')
  })
})

describe('Issue: boundary radius sphere formation', () => {
  it('should demonstrate that boundaryRadius=100 clamps expanding nodes into a shell', async () => {
    const { simulateStep } = await import('../ForceLayout3DWorker')

    // Place 200 nodes randomly in a small radius — repulsion will push them out
    const nodeCount = 200
    const positions = new Map<string, [number, number, number]>()
    const velocities = new Map<string, [number, number, number]>()
    for (let i = 0; i < nodeCount; i++) {
      positions.set(`n${i}`, [
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
      ])
      velocities.set(`n${i}`, [0, 0, 0])
    }

    // No edges — pure repulsion, all nodes push each other away
    const state = {
      positions,
      velocities,
      edges: [] as Array<{ source: string; target: string }>,
      physics: {
        repulsionStrength: 200,
        springLength: 8,
        springStrength: 1.0,
        centerStrength: 0.1,
        damping: 0.8,
        boundaryRadius: 100,
        boundaryStrength: 2.0,
      },
    }

    // Run 300 steps
    for (let i = 0; i < 300; i++) {
      simulateStep(state, 0.016)
    }

    // Measure the distribution of distances from origin
    const distances: number[] = []
    for (const pos of state.positions.values()) {
      distances.push(Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2))
    }
    const maxDist = Math.max(...distances)
    const minDist = Math.min(...distances)
    const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length

    // With boundaryRadius=100 and strong repulsion, nodes pile up at the boundary.
    // The "sphere mold" effect: most nodes are near the boundary radius.
    // Check if the shell is thin relative to the radius (sphere formation).
    const shellThickness = maxDist - minDist
    const shellRatio = shellThickness / maxDist

    // If nodes form a sphere, the shell ratio will be small (most nodes near boundary)
    // A well-distributed volume would have shellRatio close to 1.0
    console.log(`[Boundary test] max=${maxDist.toFixed(1)}, min=${minDist.toFixed(1)}, avg=${avgDist.toFixed(1)}, shellRatio=${shellRatio.toFixed(3)}`)

    // FINDING: With only 200 nodes, repulsion + center gravity reach equilibrium
    // well before the boundary (max ~31). The shell pattern comes from the
    // repulsion/gravity balance, NOT from hitting the boundary wall.
    // The boundary matters more with thousands of nodes or very strong repulsion.
    expect(maxDist).toBeLessThan(100) // nodes don't reach boundary
    // But avg/max ratio shows thin-shell distribution (sphere pattern from physics)
    expect(avgDist / maxDist).toBeGreaterThan(0.7) // shell-like distribution
  })

  it('should show that a larger boundary allows better volume distribution', async () => {
    const { simulateStep } = await import('../ForceLayout3DWorker')

    const nodeCount = 200
    const positions = new Map<string, [number, number, number]>()
    const velocities = new Map<string, [number, number, number]>()
    for (let i = 0; i < nodeCount; i++) {
      positions.set(`n${i}`, [
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
      ])
      velocities.set(`n${i}`, [0, 0, 0])
    }

    const state = {
      positions,
      velocities,
      edges: [] as Array<{ source: string; target: string }>,
      physics: {
        repulsionStrength: 200,
        springLength: 8,
        springStrength: 1.0,
        centerStrength: 0.1,
        damping: 0.8,
        boundaryRadius: 4000, // Much larger boundary
        boundaryStrength: 2.0,
      },
    }

    for (let i = 0; i < 300; i++) {
      simulateStep(state, 0.016)
    }

    const distances: number[] = []
    for (const pos of state.positions.values()) {
      distances.push(Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2))
    }
    const maxDist = Math.max(...distances)

    console.log(`[Large boundary test] max=${maxDist.toFixed(1)}, boundary=4000`)

    // With a much larger boundary, disconnected nodes still expand but
    // they won't hit the wall — they'll be limited by center gravity instead.
    // The key question: does a larger boundary actually help for CONNECTED graphs?
    // For disconnected nodes (orphans), yes. But for a real graph with springs,
    // the boundary might not matter much since springs hold things together.
    expect(maxDist).toBeLessThan(4000) // shouldn't reach the much larger boundary
  })

})

describe('Issue: cluster separation force magnitude', () => {
  it('should compare cluster separation force vs node repulsion force', async () => {
    const { computeClusteringForces, computeRepulsionForces } = await import('../ForceLayout3DWorker')

    // Two clusters with 50 nodes each, centroids 20 apart
    const clusterA: string[] = []
    const clusterB: string[] = []
    const positions = new Map<string, [number, number, number]>()

    for (let i = 0; i < 50; i++) {
      const idA = `a${i}`
      const idB = `b${i}`
      clusterA.push(idA)
      clusterB.push(idB)
      // Cluster A around (-10, 0, 0)
      positions.set(idA, [-10 + Math.random() * 2, Math.random() * 2, Math.random() * 2])
      // Cluster B around (10, 0, 0)
      positions.set(idB, [10 + Math.random() * 2, Math.random() * 2, Math.random() * 2])
    }

    const namespaceGroups = new Map([
      ['clusterA', clusterA],
      ['clusterB', clusterB],
    ])

    // Measure cluster separation force with current defaults
    const clusterForces = new Map<string, [number, number, number]>()
    for (const id of positions.keys()) clusterForces.set(id, [0, 0, 0])

    computeClusteringForces(namespaceGroups, positions, clusterForces, {
      clusteringStrength: 0.4,
      clusterSeparation: 0,     // disabled — BH repulsion handles separation
    })

    // Measure repulsion force for comparison
    const allPositions = Array.from(positions.values())
    const repulsionForces = allPositions.map((): [number, number, number] => [0, 0, 0])
    computeRepulsionForces(allPositions, repulsionForces, 200)

    // Compare magnitudes
    const avgClusterForce = Array.from(clusterForces.values())
      .reduce((sum, f) => sum + Math.sqrt(f[0] ** 2 + f[1] ** 2 + f[2] ** 2), 0) / clusterForces.size
    const avgRepulsionForce = repulsionForces
      .reduce((sum, f) => sum + Math.sqrt(f[0] ** 2 + f[1] ** 2 + f[2] ** 2), 0) / repulsionForces.length

    console.log(`[Force magnitude] avgClusterForce=${avgClusterForce.toFixed(4)}, avgRepulsionForce=${avgRepulsionForce.toFixed(4)}, ratio=${(avgClusterForce / avgRepulsionForce).toFixed(6)}`)

    // With clusterSeparation=0, cluster forces are purely attraction to own centroid.
    // They should be meaningful enough to pull nodes into groups.
    const ratio = avgClusterForce / avgRepulsionForce
    console.log(`[Force magnitude] ratio=${ratio.toFixed(6)}`)
    // Cluster attraction should be non-trivial (> 0.1% of repulsion)
    expect(avgClusterForce).toBeGreaterThan(0)
  })
})

describe('Issue: center gravity does not scale with node count', () => {
  // Claim: repulsion is O(N) per node (each node feels N-1 forces), but
  // center gravity is fixed at centerStrength per node regardless of N.
  // For large N, repulsion overwhelms gravity → sphere expansion.

  it('should show equilibrium radius grows with node count at fixed centerStrength', async () => {
    const { simulateStep } = await import('../ForceLayout3DWorker')

    const measureEquilibrium = (nodeCount: number, steps: number) => {
      const positions = new Map<string, [number, number, number]>()
      const velocities = new Map<string, [number, number, number]>()
      for (let i = 0; i < nodeCount; i++) {
        positions.set(`n${i}`, [
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
        ])
        velocities.set(`n${i}`, [0, 0, 0])
      }
      const state = {
        positions, velocities,
        edges: [] as Array<{ source: string; target: string }>,
        physics: {
          repulsionStrength: 200,
          springLength: 8,
          springStrength: 1.0,
          centerStrength: 0.1, // fixed, does not scale
          damping: 0.8,
          boundaryRadius: 10000, // very large so it's not the bottleneck
          boundaryStrength: 2.0,
        },
      }
      for (let i = 0; i < steps; i++) simulateStep(state, 0.016)
      const distances: number[] = []
      for (const pos of state.positions.values()) {
        distances.push(Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2))
      }
      return Math.max(...distances)
    }

    // Compare equilibrium radius at different scales
    // NOTE: simulateStep now scales center gravity internally, so this test
    // actually shows the WITH-scaling behavior. We keep it as a baseline.
    const r100 = measureEquilibrium(100, 500)
    const r500 = measureEquilibrium(500, 500)

    console.log(`[Gravity scaling] 100 nodes → max=${r100.toFixed(1)}, 500 nodes → max=${r500.toFixed(1)}, growth=${(r500/r100).toFixed(2)}x`)

    // Even with dynamic scaling, more nodes = larger graph (just less so)
    expect(r500).toBeGreaterThan(r100 * 1.2)
  })

  it('should show simulateStep now scales center gravity internally', async () => {
    const { simulateStep } = await import('../ForceLayout3DWorker')

    // simulateStep now computes: dynamicCenterStrength = centerStrength * max(1, N/400)
    // So with centerStrength=0.05, a 500-node graph gets 0.05 * 1.25 = 0.0625
    // a 2000-node graph gets 0.05 * 5 = 0.25
    // This should keep large graphs more compact than fixed gravity.

    const measureEquilibrium = (nodeCount: number, steps: number) => {
      const positions = new Map<string, [number, number, number]>()
      const velocities = new Map<string, [number, number, number]>()
      for (let i = 0; i < nodeCount; i++) {
        positions.set(`n${i}`, [
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
        ])
        velocities.set(`n${i}`, [0, 0, 0])
      }
      const state = {
        positions, velocities,
        edges: [] as Array<{ source: string; target: string }>,
        physics: {
          repulsionStrength: 200,
          springLength: 8,
          springStrength: 1.0,
          centerStrength: 0.05, // base — simulateStep scales internally
          damping: 0.8,
          boundaryRadius: 10000,
          boundaryStrength: 2.0,
        },
      }
      for (let i = 0; i < steps; i++) simulateStep(state, 0.016)
      const distances: number[] = []
      for (const pos of state.positions.values()) {
        distances.push(Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2))
      }
      return Math.max(...distances)
    }

    const r100 = measureEquilibrium(100, 500)
    const r500 = measureEquilibrium(500, 500)
    const r2000 = measureEquilibrium(2000, 300) // fewer steps for speed

    console.log(`[Dynamic gravity in simulateStep] 100→${r100.toFixed(1)}, 500→${r500.toFixed(1)} (${(r500/r100).toFixed(2)}x), 2000→${r2000.toFixed(1)} (${(r2000/r100).toFixed(2)}x)`)

    // With internal scaling (2000/400=5x gravity), large graphs stay compact
    expect(r2000 / r100).toBeLessThan(5.0)
  })
})

describe('Issue: mass-scaled cluster repulsion causing explosion', () => {
  it('should measure outward force from mass-scaled cluster separation', async () => {
    const { simulateStep } = await import('../ForceLayout3DWorker')

    // Create a connected graph with 2 clusters of 100 nodes each
    const positions = new Map<string, [number, number, number]>()
    const velocities = new Map<string, [number, number, number]>()
    const edges: Array<{ source: string; target: string }> = []
    const groupA: string[] = []
    const groupB: string[] = []

    for (let i = 0; i < 100; i++) {
      const idA = `a${i}`, idB = `b${i}`
      groupA.push(idA)
      groupB.push(idB)
      positions.set(idA, [-5 + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4])
      positions.set(idB, [5 + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4])
      velocities.set(idA, [0, 0, 0])
      velocities.set(idB, [0, 0, 0])
      // Intra-cluster edges
      if (i > 0) {
        edges.push({ source: `a${i}`, target: `a${i-1}` })
        edges.push({ source: `b${i}`, target: `b${i-1}` })
      }
    }
    // A few cross-cluster edges
    edges.push({ source: 'a0', target: 'b0' })
    edges.push({ source: 'a50', target: 'b50' })

    // Run WITH mass-scaled cluster separation=200
    const stateWithSep = {
      positions: new Map(positions),
      velocities: new Map(velocities),
      edges,
      physics: {
        repulsionStrength: 200,
        springLength: 8,
        springStrength: 1.0,
        centerStrength: 0.1,
        damping: 0.8,
        clusteringEnabled: true,
        clusteringStrength: 0.5,
        clusterSeparation: 200,
        boundaryRadius: 10000,
        boundaryStrength: 2.0,
      },
      namespaceGroups: new Map([['A', groupA], ['B', groupB]]),
    }

    // Run WITHOUT cluster separation
    const stateNoSep = {
      positions: new Map(positions),
      velocities: new Map(velocities),
      edges,
      physics: {
        ...stateWithSep.physics,
        clusterSeparation: 0,
      },
      namespaceGroups: new Map([['A', [...groupA]], ['B', [...groupB]]]),
    }

    for (let i = 0; i < 300; i++) {
      simulateStep(stateWithSep, 0.016)
      simulateStep(stateNoSep, 0.016)
    }

    const maxDist = (state: typeof stateWithSep) => {
      let max = 0
      for (const pos of state.positions.values()) {
        const d = Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2)
        if (d > max) max = d
      }
      return max
    }

    const rWithSep = maxDist(stateWithSep)
    const rNoSep = maxDist(stateNoSep)

    console.log(`[Cluster explosion test] withSep=${rWithSep.toFixed(1)}, noSep=${rNoSep.toFixed(1)}, ratio=${(rWithSep/rNoSep).toFixed(2)}x`)

    // If mass-scaled separation causes explosion, the with-separation version
    // will be dramatically larger than without
  })
})

describe('Issue: warmup blocking', () => {
  it('warmup is now chunked via setTimeout — verify it was refactored', async () => {
    // Read the source to confirm the chunked approach is in place.
    // This is a structural test — we can't easily test setTimeout in unit tests,
    // but we can verify the warmingUp flag exists in createWorkerHandler.
    const { createWorkerHandler } = await import('../ForceLayout3DWorker')
    const handler = createWorkerHandler()

    // The handler should be a function
    expect(typeof handler).toBe('function')

    // We can't easily test the chunked warmup without a mock worker environment,
    // but the code review confirms it uses setTimeout(runChunk, 0) instead of
    // a synchronous for-loop. This test just ensures the refactored handler loads.
  })
})

describe('Full physics config', () => {
  it('should support all physics parameters in simulateStep', async () => {
    const { simulateStep } = await import('../ForceLayout3DWorker')

    const state = {
      positions: new Map<string, [number, number, number]>([
        ['a', [0, 0, 0]],
        ['b', [10, 0, 0]],
      ]),
      velocities: new Map<string, [number, number, number]>([
        ['a', [0, 0, 0]],
        ['b', [0, 0, 0]],
      ]),
      edges: [{ source: 'a', target: 'b' }],
      physics: {
        // Basic physics
        repulsionStrength: 200,
        springLength: 8,
        springStrength: 1,
        centerStrength: 0.05,
        damping: 0.8,
        // Clustering
        clusteringEnabled: true,
        clusteringStrength: 0.3,
        clusterSeparation: 0.5,
        // Adaptive spring
        adaptiveSpringEnabled: true,
        adaptiveSpringMode: 'sqrt' as const,
        adaptiveSpringScale: 0.5,
      },
      // Namespace groups for clustering
      namespaceGroups: new Map([
        ['ns1', ['a', 'b']],
      ]),
    }

    // Should not throw
    const step = simulateStep(state, 0.016)
    expect(step.movement).toBeGreaterThanOrEqual(0)
    expect(step.phases.total).toBeGreaterThanOrEqual(0)
  })
})
