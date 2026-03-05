/**
 * ForceLayout3DWorker - Pure functions for 3D force-directed layout
 *
 * These functions can run in a Web Worker to offload physics
 * computation from the main thread.
 *
 * Based on the existing ForceLayout.tsx implementation.
 */

// ============================================
// Message Types
// ============================================

export const WorkerMessageType = {
  INIT: 'init',
  STEP: 'step',
  POSITIONS: 'positions',
  STOP: 'stop',
  STABLE: 'stable',
  UPDATE_PHYSICS: 'updatePhysics',
} as const

// ============================================
// SharedArrayBuffer layout
// ============================================
// Buffer layout: [generation (1 float64)] [x0,y0,z0, x1,y1,z1, ... xN,yN,zN]
// Slot 0 = generation counter (bumped by worker after writing positions)
// Slots 1..N*3 = xyz triples in the same order as the nodeIds index array.

/** Byte size needed for a SAB position buffer with the given node count. */
export function sabByteLength(nodeCount: number): number {
  // 1 control slot + 3 floats per node, all Float64
  return (1 + nodeCount * 3) * Float64Array.BYTES_PER_ELEMENT
}

/** Offset (in Float64 elements) where position data starts. */
export const SAB_DATA_OFFSET = 1

export type AdaptiveSpringMode = 'linear' | 'sqrt' | 'logarithmic'

export interface PhysicsConfig {
  repulsionStrength: number
  springLength: number
  springStrength: number
  centerStrength: number
  damping: number
  // Namespace clustering
  clusteringEnabled?: boolean
  clusteringStrength?: number
  clusterSeparation?: number
  clusteringDepth?: number
  // Adaptive spring length
  adaptiveSpringEnabled?: boolean
  adaptiveSpringMode?: AdaptiveSpringMode
  adaptiveSpringScale?: number
  // Community-aware layout
  communityAwareLayout?: boolean
  communitySameMultiplier?: number
  communityCrossMultiplier?: number
  communityClusteringStrength?: number
  communitySeparation?: number
  // Boundary constraint
  boundaryRadius?: number
  boundaryStrength?: number
}

export interface NodeDegree {
  in: number
  out: number
  total: number
}

export interface SimulationState {
  positions: Map<string, [number, number, number]>
  velocities: Map<string, [number, number, number]>
  edges: Array<{ source: string; target: string }>
  physics: PhysicsConfig
  // Optional: for clustering
  namespaceGroups?: Map<string, string[]>
  // Optional: for adaptive springs (computed from edges if not provided)
  nodeDegrees?: Map<string, NodeDegree>
  // Optional: community assignments (nodeId → communityId)
  nodeCommunities?: Map<string, number>
}

// ============================================
// Barnes-Hut Octree (O(n log n) repulsion)
// ============================================

interface OctreeNode {
  cx: number; cy: number; cz: number  // cell center
  size: number                         // half-width
  mass: number                         // body count
  comX: number; comY: number; comZ: number  // center of mass
  children: (OctreeNode | null)[] | null
  bodyIndex: number  // -1 if internal/empty
}

const MAX_OCTREE_DEPTH = 50

function getOctant(px: number, py: number, pz: number, cx: number, cy: number, cz: number): number {
  return (px >= cx ? 1 : 0) | (py >= cy ? 2 : 0) | (pz >= cz ? 4 : 0)
}

function getChildCenter(cx: number, cy: number, cz: number, size: number, octant: number): [number, number, number] {
  const hs = size / 2
  return [
    cx + (octant & 1 ? hs : -hs),
    cy + (octant & 2 ? hs : -hs),
    cz + (octant & 4 ? hs : -hs),
  ]
}

function insertBody(
  node: OctreeNode,
  pos: [number, number, number],
  bodyIndex: number,
  allPositions: [number, number, number][],
  depth: number
): void {
  const [px, py, pz] = pos

  if (node.mass === 0) {
    node.mass = 1
    node.comX = px; node.comY = py; node.comZ = pz
    node.bodyIndex = bodyIndex
    return
  }

  if (depth >= MAX_OCTREE_DEPTH) {
    const totalMass = node.mass + 1
    node.comX = (node.comX * node.mass + px) / totalMass
    node.comY = (node.comY * node.mass + py) / totalMass
    node.comZ = (node.comZ * node.mass + pz) / totalMass
    node.mass = totalMass
    return
  }

  if (node.children !== null) {
    const totalMass = node.mass + 1
    node.comX = (node.comX * node.mass + px) / totalMass
    node.comY = (node.comY * node.mass + py) / totalMass
    node.comZ = (node.comZ * node.mass + pz) / totalMass
    node.mass = totalMass

    const octant = getOctant(px, py, pz, node.cx, node.cy, node.cz)
    if (node.children[octant] === null) {
      const [ccx, ccy, ccz] = getChildCenter(node.cx, node.cy, node.cz, node.size, octant)
      node.children[octant] = { cx: ccx, cy: ccy, cz: ccz, size: node.size / 2, mass: 0, comX: 0, comY: 0, comZ: 0, children: null, bodyIndex: -1 }
    }
    insertBody(node.children[octant]!, pos, bodyIndex, allPositions, depth + 1)
    return
  }

  // Leaf with one body → subdivide
  const existingBodyIndex = node.bodyIndex
  const existingPos = allPositions[existingBodyIndex]

  node.children = [null, null, null, null, null, null, null, null]
  node.bodyIndex = -1

  const totalMass = node.mass + 1
  node.comX = (node.comX * node.mass + px) / totalMass
  node.comY = (node.comY * node.mass + py) / totalMass
  node.comZ = (node.comZ * node.mass + pz) / totalMass
  node.mass = totalMass

  const existingOctant = getOctant(existingPos[0], existingPos[1], existingPos[2], node.cx, node.cy, node.cz)
  const [ecx, ecy, ecz] = getChildCenter(node.cx, node.cy, node.cz, node.size, existingOctant)
  node.children[existingOctant] = { cx: ecx, cy: ecy, cz: ecz, size: node.size / 2, mass: 0, comX: 0, comY: 0, comZ: 0, children: null, bodyIndex: -1 }
  insertBody(node.children[existingOctant]!, existingPos, existingBodyIndex, allPositions, depth + 1)

  const newOctant = getOctant(px, py, pz, node.cx, node.cy, node.cz)
  if (node.children[newOctant] === null) {
    const [ncx, ncy, ncz] = getChildCenter(node.cx, node.cy, node.cz, node.size, newOctant)
    node.children[newOctant] = { cx: ncx, cy: ncy, cz: ncz, size: node.size / 2, mass: 0, comX: 0, comY: 0, comZ: 0, children: null, bodyIndex: -1 }
  }
  insertBody(node.children[newOctant]!, pos, bodyIndex, allPositions, depth + 1)
}

function calculateForceOnBody(
  node: OctreeNode,
  pos: [number, number, number],
  bodyIndex: number,
  force: [number, number, number],
  repulsionStrength: number,
  theta: number
): void {
  if (node.mass === 0) return
  if (node.bodyIndex === bodyIndex) return

  const dx = node.comX - pos[0]
  const dy = node.comY - pos[1]
  const dz = node.comZ - pos[2]
  const distSq = dx * dx + dy * dy + dz * dz

  if (node.children === null && node.bodyIndex !== -1) {
    if (distSq < 0.01) return
    const dist = Math.sqrt(distSq)
    const effectiveDist = Math.max(dist, 2)
    const forceMag = repulsionStrength / (effectiveDist * effectiveDist)
    force[0] -= (dx / dist) * forceMag
    force[1] -= (dy / dist) * forceMag
    force[2] -= (dz / dist) * forceMag
    return
  }

  const dist = Math.sqrt(distSq) || 0.1
  const ratio = (node.size * 2) / dist

  if (ratio < theta) {
    const effectiveDist = Math.max(dist, 2)
    const forceMag = (repulsionStrength * node.mass) / (effectiveDist * effectiveDist)
    force[0] -= (dx / dist) * forceMag
    force[1] -= (dy / dist) * forceMag
    force[2] -= (dz / dist) * forceMag
  } else if (node.children) {
    for (const child of node.children) {
      if (child) calculateForceOnBody(child, pos, bodyIndex, force, repulsionStrength, theta)
    }
  }
}

/**
 * Compute repulsion forces using Barnes-Hut O(n log n) approximation.
 * Falls back to O(n²) pairwise for very small graphs (<50 nodes).
 */
export function computeRepulsionForces(
  positions: [number, number, number][],
  forces: [number, number, number][],
  repulsionStrength: number,
  _minDistance: number = 0.1
): void {
  const n = positions.length
  if (n === 0) return

  if (n < 50) {
    // Direct pairwise for tiny graphs (overhead of octree not worth it)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[j][0] - positions[i][0]
        const dy = positions[j][1] - positions[i][1]
        const dz = positions[j][2] - positions[i][2]
        const distSq = dx * dx + dy * dy + dz * dz
        const dist = Math.max(Math.sqrt(distSq), 0.1)
        const force = repulsionStrength / (dist * dist)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        const fz = (dz / dist) * force
        forces[i][0] -= fx; forces[i][1] -= fy; forces[i][2] -= fz
        forces[j][0] += fx; forces[j][1] += fy; forces[j][2] += fz
      }
    }
    return
  }

  // Barnes-Hut: build octree
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (const [x, y, z] of positions) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const cz = (minZ + maxZ) / 2
  const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2 + 1

  const root: OctreeNode = { cx, cy, cz, size, mass: 0, comX: 0, comY: 0, comZ: 0, children: null, bodyIndex: -1 }
  for (let i = 0; i < n; i++) insertBody(root, positions[i], i, positions, 0)
  for (let i = 0; i < n; i++) calculateForceOnBody(root, positions[i], i, forces[i], repulsionStrength, 0.7)
}

// ============================================
// Spring Forces (Hooke's Law)
// ============================================

export interface SpringConfig {
  springLength: number
  springStrength: number
}

/**
 * Compute spring forces for connected nodes
 */
export function computeSpringForces(
  positions: Map<string, [number, number, number]>,
  edges: Array<{ source: string; target: string }>,
  forces: Map<string, [number, number, number]>,
  config: SpringConfig
): void {
  const { springLength, springStrength } = config

  for (const edge of edges) {
    const p1 = positions.get(edge.source)
    const p2 = positions.get(edge.target)
    if (!p1 || !p2) continue

    const f1 = forces.get(edge.source)
    const f2 = forces.get(edge.target)
    if (!f1 || !f2) continue

    const dx = p2[0] - p1[0]
    const dy = p2[1] - p1[1]
    const dz = p2[2] - p1[2]

    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1
    const displacement = dist - springLength
    const force = springStrength * displacement

    const fx = (dx / dist) * force
    const fy = (dy / dist) * force
    const fz = (dz / dist) * force

    // Source pulled towards target
    f1[0] += fx
    f1[1] += fy
    f1[2] += fz

    // Target pulled towards source
    f2[0] -= fx
    f2[1] -= fy
    f2[2] -= fz
  }
}

// ============================================
// Namespace Clustering
// ============================================

/**
 * Compute centroid for each namespace cluster
 */
export function computeClusterCentroids(
  namespaceGroups: Map<string, string[]>,
  positions: Map<string, [number, number, number]>
): Map<string, [number, number, number]> {
  const centroids = new Map<string, [number, number, number]>()

  for (const [namespace, nodeIds] of namespaceGroups.entries()) {
    let cx = 0, cy = 0, cz = 0
    let count = 0

    for (const id of nodeIds) {
      const pos = positions.get(id)
      if (pos) {
        cx += pos[0]
        cy += pos[1]
        cz += pos[2]
        count++
      }
    }

    if (count > 0) {
      centroids.set(namespace, [cx / count, cy / count, cz / count])
    }
  }

  return centroids
}

/**
 * Compute clustering forces (attraction to own centroid + repulsion from other centroids)
 */
export function computeClusteringForces(
  namespaceGroups: Map<string, string[]>,
  positions: Map<string, [number, number, number]>,
  forces: Map<string, [number, number, number]>,
  config: { clusteringStrength: number; clusterSeparation: number }
): void {
  const { clusteringStrength, clusterSeparation } = config
  const centroids = computeClusterCentroids(namespaceGroups, positions)

  for (const [namespace, nodeIds] of namespaceGroups.entries()) {
    const centroid = centroids.get(namespace)
    if (!centroid) continue

    for (const nodeId of nodeIds) {
      const pos = positions.get(nodeId)
      const f = forces.get(nodeId)
      if (!pos || !f) continue

      // Attraction to own cluster centroid
      if (clusteringStrength > 0) {
        const dx = centroid[0] - pos[0]
        const dy = centroid[1] - pos[1]
        const dz = centroid[2] - pos[2]
        f[0] += dx * clusteringStrength
        f[1] += dy * clusteringStrength
        f[2] += dz * clusteringStrength
      }

      // Repulsion from other cluster centroids
      if (clusterSeparation > 0) {
        for (const [otherNs, otherCentroid] of centroids.entries()) {
          if (otherNs === namespace) continue

          const dx = pos[0] - otherCentroid[0]
          const dy = pos[1] - otherCentroid[1]
          const dz = pos[2] - otherCentroid[2]
          const distSq = dx * dx + dy * dy + dz * dz
          const dist = Math.sqrt(distSq) || 0.1

          // Repulsion force: F = k * mass / r² — scale by cluster size
          const otherMass = namespaceGroups.get(otherNs)?.length || 1
          const force = (clusterSeparation * otherMass) / (dist * dist)
          f[0] += (dx / dist) * force
          f[1] += (dy / dist) * force
          f[2] += (dz / dist) * force
        }
      }
    }
  }
}

// ============================================
// Adaptive Spring Length
// ============================================

/**
 * Compute in/out degrees for each node
 */
export function computeNodeDegrees(
  edges: Array<{ source: string; target: string }>
): Map<string, NodeDegree> {
  const degrees = new Map<string, NodeDegree>()

  const getOrCreate = (id: string): NodeDegree => {
    let deg = degrees.get(id)
    if (!deg) {
      deg = { in: 0, out: 0, total: 0 }
      degrees.set(id, deg)
    }
    return deg
  }

  for (const edge of edges) {
    const srcDeg = getOrCreate(edge.source)
    const tgtDeg = getOrCreate(edge.target)
    srcDeg.out++
    srcDeg.total++
    tgtDeg.in++
    tgtDeg.total++
  }

  return degrees
}

export interface AdaptiveSpringConfig {
  baseLength: number
  mode: AdaptiveSpringMode
  scaleFactor: number
  minLength: number
  maxLength: number
}

/**
 * Calculate adaptive spring length based on node degrees
 * Higher degree nodes get longer springs to spread out
 */
export function calculateAdaptiveSpringLength(
  deg1: NodeDegree,
  deg2: NodeDegree,
  config: AdaptiveSpringConfig
): number {
  const { baseLength, mode, scaleFactor, minLength, maxLength } = config

  // Use max degree of the two endpoints
  const maxDegree = Math.max(deg1.total, deg2.total)

  let multiplier: number
  switch (mode) {
    case 'linear':
      multiplier = 1 + maxDegree * scaleFactor
      break
    case 'sqrt':
      multiplier = 1 + Math.sqrt(maxDegree) * scaleFactor
      break
    case 'logarithmic':
      multiplier = 1 + Math.log(maxDegree + 1) * scaleFactor
      break
    default:
      multiplier = 1
  }

  const length = baseLength * multiplier
  return Math.max(minLength, Math.min(maxLength, length))
}

// ============================================
// Center Gravity
// ============================================

/**
 * Apply center gravity to prevent graph from drifting
 */
export function computeCenterGravity(
  positions: Map<string, [number, number, number]>,
  forces: Map<string, [number, number, number]>,
  strength: number
): void {
  for (const [id, pos] of positions.entries()) {
    const f = forces.get(id)
    if (!f) continue

    f[0] -= pos[0] * strength
    f[1] -= pos[1] * strength
    f[2] -= pos[2] * strength
  }
}

// ============================================
// Velocity & Integration
// ============================================

/**
 * Apply damping to velocities
 */
export function applyDamping(
  velocities: Map<string, [number, number, number]>,
  damping: number
): void {
  for (const [id, vel] of velocities.entries()) {
    velocities.set(id, [vel[0] * damping, vel[1] * damping, vel[2] * damping])
  }
}

/**
 * Limit velocity magnitude
 */
export function limitVelocity(
  vel: [number, number, number],
  maxVelocity: number
): [number, number, number] {
  const speed = Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2])
  if (speed > maxVelocity) {
    const scale = maxVelocity / speed
    return [vel[0] * scale, vel[1] * scale, vel[2] * scale]
  }
  return vel
}

/**
 * Check if simulation is stable
 */
export function isStable(totalMovement: number, threshold: number = 0.01): boolean {
  return totalMovement < threshold
}

// ============================================
// Full Simulation Step
// ============================================

/**
 * Execute one physics simulation step
 * Returns total movement and phase timings for profiling
 */
export interface WorkerStepPhaseDurations {
  repulsion: number
  springs: number
  center: number
  clustering: number
  integrate: number
  total: number
}

export interface WorkerMessagePhaseDurations extends WorkerStepPhaseDurations {
  transferIn: number
  serialize: number
}

export interface WorkerStepResult {
  movement: number
  phases: WorkerStepPhaseDurations
}

export function simulateStep(state: SimulationState, dt: number = 0.016): WorkerStepResult {
  const totalStart = performance.now()
  const { positions, velocities, edges, physics, namespaceGroups, nodeCommunities } = state
  const nodeIds = Array.from(positions.keys())
  const nodeCount = nodeIds.length

  if (nodeCount === 0) {
    return {
      movement: 0,
      phases: {
        repulsion: 0,
        springs: 0,
        center: 0,
        clustering: 0,
        integrate: 0,
        total: 0,
      },
    }
  }

  // Initialize forces
  const forces = new Map<string, [number, number, number]>()
  for (const id of nodeIds) {
    forces.set(id, [0, 0, 0])
  }

  // Compute repulsion (use array format for performance)
  const repulsionStart = performance.now()
  const posArray: [number, number, number][] = []
  const forceArray: [number, number, number][] = []
  for (const id of nodeIds) {
    posArray.push([...positions.get(id)!])
    forceArray.push([0, 0, 0])
  }

  computeRepulsionForces(posArray, forceArray, physics.repulsionStrength)

  // Copy back to map
  for (let i = 0; i < nodeIds.length; i++) {
    const f = forces.get(nodeIds[i])!
    f[0] += forceArray[i][0]
    f[1] += forceArray[i][1]
    f[2] += forceArray[i][2]
  }
  const repulsionDur = performance.now() - repulsionStart

  // Compute spring forces (with optional adaptive length)
  const springsStart = performance.now()
  const nodeDegrees = state.nodeDegrees || (physics.adaptiveSpringEnabled ? computeNodeDegrees(edges) : null)

  if (physics.adaptiveSpringEnabled && nodeDegrees) {
    // Adaptive spring: compute per-edge spring length
    const baseLength = physics.springLength
    const config: AdaptiveSpringConfig = {
      baseLength,
      mode: physics.adaptiveSpringMode || 'sqrt',
      scaleFactor: physics.adaptiveSpringScale || 0.5,
      minLength: baseLength * 0.5,
      maxLength: baseLength * 5,
    }

    for (const edge of edges) {
      const p1 = positions.get(edge.source)
      const p2 = positions.get(edge.target)
      if (!p1 || !p2) continue

      const f1 = forces.get(edge.source)
      const f2 = forces.get(edge.target)
      if (!f1 || !f2) continue

      const deg1 = nodeDegrees.get(edge.source) || { in: 0, out: 0, total: 0 }
      const deg2 = nodeDegrees.get(edge.target) || { in: 0, out: 0, total: 0 }
      let springLength = calculateAdaptiveSpringLength(deg1, deg2, config)

      // Community-aware spring adjustment
      if (physics.communityAwareLayout && nodeCommunities) {
        const comm1 = nodeCommunities.get(edge.source)
        const comm2 = nodeCommunities.get(edge.target)
        if (comm1 !== undefined && comm2 !== undefined) {
          springLength *= comm1 === comm2
            ? (physics.communitySameMultiplier ?? 0.2)
            : (physics.communityCrossMultiplier ?? 5.0)
        }
      }

      const dx = p2[0] - p1[0]
      const dy = p2[1] - p1[1]
      const dz = p2[2] - p1[2]
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1
      const displacement = dist - springLength
      const force = physics.springStrength * displacement

      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      const fz = (dz / dist) * force

      f1[0] += fx; f1[1] += fy; f1[2] += fz
      f2[0] -= fx; f2[1] -= fy; f2[2] -= fz
    }
  } else if (physics.communityAwareLayout && nodeCommunities) {
    // Fixed spring length with community-aware adjustment
    const baseLen = physics.springLength
    const sameMul = physics.communitySameMultiplier ?? 0.2
    const crossMul = physics.communityCrossMultiplier ?? 5.0
    for (const edge of edges) {
      const p1 = positions.get(edge.source)
      const p2 = positions.get(edge.target)
      if (!p1 || !p2) continue
      const f1 = forces.get(edge.source)
      const f2 = forces.get(edge.target)
      if (!f1 || !f2) continue

      let springLength = baseLen
      const comm1 = nodeCommunities.get(edge.source)
      const comm2 = nodeCommunities.get(edge.target)
      if (comm1 !== undefined && comm2 !== undefined) {
        springLength *= comm1 === comm2 ? sameMul : crossMul
      }

      const dx = p2[0] - p1[0]
      const dy = p2[1] - p1[1]
      const dz = p2[2] - p1[2]
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1
      const displacement = dist - springLength
      const force = physics.springStrength * displacement
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      const fz = (dz / dist) * force
      f1[0] += fx; f1[1] += fy; f1[2] += fz
      f2[0] -= fx; f2[1] -= fy; f2[2] -= fz
    }
  } else {
    // Fixed spring length, no community adjustment
    computeSpringForces(positions, edges, forces, {
      springLength: physics.springLength,
      springStrength: physics.springStrength,
    })
  }
  const springsDur = performance.now() - springsStart

  // Compute center gravity — scale with graph size so large graphs don't
  // expand indefinitely (repulsion is O(N) per node but gravity is fixed).
  const centerStart = performance.now()
  const dynamicCenterStrength = physics.centerStrength * Math.max(1, nodeCount / 400)
  computeCenterGravity(positions, forces, dynamicCenterStrength)
  const centerDur = performance.now() - centerStart

  // Compute clustering forces (if enabled)
  let clusteringDur = 0
  if (physics.clusteringEnabled && namespaceGroups && namespaceGroups.size > 0) {
    const clusteringStart = performance.now()
    computeClusteringForces(namespaceGroups, positions, forces, {
      clusteringStrength: physics.clusteringStrength ?? 0.3,
      clusterSeparation: physics.clusterSeparation ?? 0.5,
    })
    clusteringDur = performance.now() - clusteringStart
  }

  // Community clustering forces (direct attraction/repulsion like namespace clustering)
  if (physics.communityAwareLayout && nodeCommunities && nodeCommunities.size > 0) {
    const commClusterStart = performance.now()
    const commStrength = physics.communityClusteringStrength ?? 2.0
    const commSeparation = physics.communitySeparation ?? 3.0

    // Group nodes by community ID
    const communityGroups = new Map<number, string[]>()
    for (const [nodeId, communityId] of nodeCommunities.entries()) {
      let group = communityGroups.get(communityId)
      if (!group) {
        group = []
        communityGroups.set(communityId, group)
      }
      group.push(nodeId)
    }

    // Compute community centroids
    const centroids = new Map<number, [number, number, number]>()
    for (const [communityId, memberIds] of communityGroups.entries()) {
      let cx = 0, cy = 0, cz = 0, count = 0
      for (const id of memberIds) {
        const pos = positions.get(id)
        if (pos) { cx += pos[0]; cy += pos[1]; cz += pos[2]; count++ }
      }
      if (count > 0) {
        centroids.set(communityId, [cx / count, cy / count, cz / count])
      }
    }

    // Apply attraction to own centroid + repulsion from other centroids
    for (const [communityId, memberIds] of communityGroups.entries()) {
      const centroid = centroids.get(communityId)
      if (!centroid) continue

      for (const nodeId of memberIds) {
        const pos = positions.get(nodeId)
        const f = forces.get(nodeId)
        if (!pos || !f) continue

        // Attraction to own community centroid
        if (commStrength > 0) {
          f[0] += (centroid[0] - pos[0]) * commStrength
          f[1] += (centroid[1] - pos[1]) * commStrength
          f[2] += (centroid[2] - pos[2]) * commStrength
        }

        // Repulsion from other community centroids
        if (commSeparation > 0) {
          for (const [otherId, otherCentroid] of centroids.entries()) {
            if (otherId === communityId) continue
            const dx = pos[0] - otherCentroid[0]
            const dy = pos[1] - otherCentroid[1]
            const dz = pos[2] - otherCentroid[2]
            const distSq = dx * dx + dy * dy + dz * dz
            const dist = Math.sqrt(distSq)
            if (dist < 0.1) continue
            const force = commSeparation / (distSq + 1)
            f[0] += (dx / dist) * force
            f[1] += (dy / dist) * force
            f[2] += (dz / dist) * force
          }
        }
      }
    }
    clusteringDur += performance.now() - commClusterStart
  }

  // Boundary constraint — push nodes back when they exceed the boundary radius
  const boundaryRadius = physics.boundaryRadius ?? 100
  const boundaryStrength = physics.boundaryStrength ?? 2.0
  for (const id of nodeIds) {
    const pos = positions.get(id)!
    const dist = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2])
    if (dist > boundaryRadius) {
      const f = forces.get(id)!
      const overshoot = dist - boundaryRadius
      const push = boundaryStrength * overshoot
      f[0] -= (pos[0] / dist) * push
      f[1] -= (pos[1] / dist) * push
      f[2] -= (pos[2] / dist) * push
    }
  }

  // Apply forces and update positions
  const integrateStart = performance.now()
  const maxVelocity = 10
  let totalMovement = 0

  for (const id of nodeIds) {
    const pos = positions.get(id)!
    let vel = velocities.get(id) || [0, 0, 0]
    const force = forces.get(id)!

    // Update velocity: v = (v + F * dt) * damping
    vel = [
      (vel[0] + force[0] * dt) * physics.damping,
      (vel[1] + force[1] * dt) * physics.damping,
      (vel[2] + force[2] * dt) * physics.damping,
    ]

    // Limit velocity
    vel = limitVelocity(vel, maxVelocity)
    velocities.set(id, vel)

    // Update position: p = p + v * dt
    let nx = pos[0] + vel[0] * dt
    let ny = pos[1] + vel[1] * dt
    let nz = pos[2] + vel[2] * dt

    // Hard boundary clamp
    if (boundaryRadius > 0) {
      const newDist = Math.sqrt(nx * nx + ny * ny + nz * nz)
      if (newDist > boundaryRadius) {
        const scale = boundaryRadius / newDist
        nx *= scale; ny *= scale; nz *= scale
        velocities.set(id, [0, 0, 0])
      }
    }

    positions.set(id, [nx, ny, nz])

    totalMovement += Math.abs(vel[0]) + Math.abs(vel[1]) + Math.abs(vel[2])
  }
  const integrateDur = performance.now() - integrateStart

  return {
    movement: totalMovement,
    phases: {
      repulsion: repulsionDur,
      springs: springsDur,
      center: centerDur,
      clustering: clusteringDur,
      integrate: integrateDur,
      total: performance.now() - totalStart,
    },
  }
}

// ============================================
// Worker Entry Point (for actual worker file)
// ============================================

/**
 * Create worker message handler
 * Use this in the actual worker file:
 *
 * ```ts
 * import { createWorkerHandler } from './ForceLayout3DWorker'
 * self.onmessage = createWorkerHandler()
 * ```
 */
export function createWorkerHandler() {
  let state: SimulationState | null = null
  let running = false
  let stableFrames = 0
  let warmingUp = false
  // SharedArrayBuffer path: index mapping + typed view
  let sabView: Float64Array | null = null
  let sabNodeIds: string[] | null = null

  /** Emit current positions to main thread (SAB or structured-clone). */
  const emitPositions = (
    st: SimulationState,
    sab: Float64Array | null,
    nodeIds: string[] | null,
  ) => {
    let positionsPayload: Array<[string, [number, number, number]]> | null = null
    if (sab && nodeIds) {
      for (let i = 0; i < nodeIds.length; i++) {
        const pos = st.positions.get(nodeIds[i])
        if (pos) {
          const off = SAB_DATA_OFFSET + i * 3
          sab[off] = pos[0]; sab[off + 1] = pos[1]; sab[off + 2] = pos[2]
        }
      }
      sab[0] = (sab[0] || 0) + 1
    } else {
      positionsPayload = Array.from(st.positions.entries())
    }
    self.postMessage({
      type: WorkerMessageType.POSITIONS,
      positions: positionsPayload,
      movement: 0,
      stableFrames: 0,
    })
  }

  return (e: MessageEvent) => {
    const { type, data } = e.data

    switch (type) {
      case WorkerMessageType.INIT: {
        const positions = new Map<string, [number, number, number]>(data.positions)

        // Seed positions for new nodes that don't have cached positions.
        // This is done on the worker thread to avoid blocking the main thread
        // with expensive trig math for thousands of nodes.
        const newNodeIds: string[] | undefined = data.newNodeIds
        if (newNodeIds && newNodeIds.length > 0) {
          const edges: Array<{ source: string; target: string }> = data.edges
          const physics: PhysicsConfig = data.physics

          // Build adjacency for neighbor-aware placement
          const adjacency = new Map<string, string[]>()
          for (const edge of edges) {
            if (!adjacency.has(edge.source)) adjacency.set(edge.source, [])
            if (!adjacency.has(edge.target)) adjacency.set(edge.target, [])
            adjacency.get(edge.source)!.push(edge.target)
            adjacency.get(edge.target)!.push(edge.source)
          }

          // Separate new nodes into neighbor-placed vs orphan
          const orphans: string[] = []
          for (const id of newNodeIds) {
            const neighbors = adjacency.get(id)
            let placed = false
            if (neighbors) {
              for (const nId of neighbors) {
                const nPos = positions.get(nId)
                if (nPos) {
                  // Place near existing neighbor with small random offset
                  const jitter = (physics.springLength || 8) * 0.3
                  positions.set(id, [
                    nPos[0] + (Math.random() - 0.5) * jitter,
                    nPos[1] + (Math.random() - 0.5) * jitter,
                    nPos[2] + (Math.random() - 0.5) * jitter,
                  ])
                  placed = true
                  break
                }
              }
            }
            if (!placed) orphans.push(id)
          }

          // Place orphans on a Fibonacci spiral centered on existing nodes' centroid
          if (orphans.length > 0) {
            // Compute centroid of existing positioned nodes
            let cx = 0, cy = 0, cz = 0, count = 0
            for (const pos of positions.values()) {
              cx += pos[0]; cy += pos[1]; cz += pos[2]; count++
            }
            if (count > 0) { cx /= count; cy /= count; cz /= count }

            // Compute spread radius (matching ForceLayout's targetRadius logic)
            const totalNodes = positions.size + orphans.length
            const totalEdges = edges.length
            const springLen = physics.springLength || 8
            const baseRadius = 12
            const dynamicRadius = Math.sqrt(totalNodes) * springLen * 0.5
            const maxRadius = totalEdges > 5000 ? 80 : totalEdges > 1000 ? 50 : 24
            const spreadRadius = Math.min(maxRadius, Math.max(baseRadius, dynamicRadius)) * 1.2

            // Fibonacci spiral with progressive cbrt radius for volume fill
            const goldenAngle = Math.PI * (3 - Math.sqrt(5))
            const n = orphans.length
            for (let i = 0; i < n; i++) {
              const theta = i * goldenAngle
              const phi = Math.acos(1 - (2 * (i + 0.5)) / Math.max(n, 1))
              const r = spreadRadius * (0.1 + 0.9 * Math.pow((i + 1) / n, 1 / 3))
              positions.set(orphans[i], [
                cx + r * Math.sin(phi) * Math.cos(theta),
                cy + r * Math.sin(phi) * Math.sin(theta),
                cz + r * Math.cos(phi),
              ])
            }
          }
        }

        state = {
          positions,
          velocities: new Map(data.velocities || []),
          edges: data.edges,
          physics: data.physics,
          namespaceGroups: data.namespaceGroups ? new Map(data.namespaceGroups) : undefined,
          nodeCommunities: data.nodeCommunities ? new Map<string, number>(data.nodeCommunities) : undefined,
          // Pre-compute node degrees once (used every step for adaptive springs)
          nodeDegrees: data.physics.adaptiveSpringEnabled ? computeNodeDegrees(data.edges) : undefined,
        }
        // Initialize velocities if not provided
        for (const id of state.positions.keys()) {
          if (!state.velocities.has(id)) {
            state.velocities.set(id, [0, 0, 0])
          }
        }
        // Set up SAB view if provided
        if (data.sab instanceof SharedArrayBuffer && Array.isArray(data.nodeIds)) {
          sabView = new Float64Array(data.sab)
          sabNodeIds = data.nodeIds
        } else {
          sabView = null
          sabNodeIds = null
        }
        running = true
        stableFrames = 0
        warmingUp = true

        // Send initial positions immediately so the main thread can render
        // something while warmup runs in the background.
        emitPositions(state, sabView, sabNodeIds)

        // Run warmup in chunks via setTimeout so the worker can still
        // process STEP messages between chunks (non-blocking).
        {
          const nodeCount = state.positions.size
          const edgeCount = state.edges.length
          const base = Math.min(300, 100 + nodeCount)
          const totalWarmupSteps = (nodeCount > 500 || edgeCount > 1000)
            ? Math.min(100, base)
            : base
          const CHUNK_SIZE = 20 // iterations per setTimeout batch
          let completed = 0
          let stableCount = 0

          const runChunk = () => {
            if (!state || !running) { warmingUp = false; return }
            const end = Math.min(completed + CHUNK_SIZE, totalWarmupSteps)
            for (let i = completed; i < end; i++) {
              const step = simulateStep(state!, 0.016)
              if (step.movement < 0.05) { stableCount++; if (stableCount > 10) { completed = totalWarmupSteps; break } }
              else { stableCount = 0 }
            }
            completed = Math.max(completed, end)

            // Emit intermediate positions so the UI shows progressive settling
            emitPositions(state!, sabView, sabNodeIds)

            if (completed >= totalWarmupSteps) {
              warmingUp = false
            } else {
              setTimeout(runChunk, 0)
            }
          }
          setTimeout(runChunk, 0)
        }
        break
      }

      case WorkerMessageType.STEP: {
        if (!state || !running) return

        // During warmup, just emit current positions (warmup chunks do the physics)
        if (warmingUp) {
          emitPositions(state, sabView, sabNodeIds)
          return
        }

        const receivedAtAbs = performance.timeOrigin + performance.now()
        const transferIn = typeof data?.clientSentAtAbs === 'number'
          ? Math.max(0, receivedAtAbs - data.clientSentAtAbs)
          : 0
        const step = simulateStep(state, data?.dt || 0.016)
        const stepDur = step.phases.total

        // Check stability
        if (isStable(step.movement)) {
          stableFrames++
          if (stableFrames > 60) {
            self.postMessage({ type: WorkerMessageType.STABLE })
          }
        } else {
          stableFrames = 0
        }

        const serializeStart = performance.now()
        let positionsPayload: Array<[string, [number, number, number]]> | null = null

        if (sabView && sabNodeIds) {
          // Write positions directly into the SharedArrayBuffer — zero-copy transfer.
          const positions = state.positions
          for (let i = 0; i < sabNodeIds.length; i++) {
            const pos = positions.get(sabNodeIds[i])
            if (pos) {
              const off = SAB_DATA_OFFSET + i * 3
              sabView[off]     = pos[0]
              sabView[off + 1] = pos[1]
              sabView[off + 2] = pos[2]
            }
          }
          // Bump generation counter so main thread knows data is fresh
          sabView[0] = (sabView[0] || 0) + 1
        } else {
          // Fallback: structured-clone path
          positionsPayload = Array.from(state.positions.entries())
        }
        const serializeDur = performance.now() - serializeStart

        const workerSentAtAbs = performance.timeOrigin + performance.now()
        const phaseDurations: WorkerMessagePhaseDurations = {
          ...step.phases,
          transferIn,
          serialize: serializeDur,
        }

        // Send lightweight metadata (positions are in SAB, or fallback payload)
        self.postMessage({
          type: WorkerMessageType.POSITIONS,
          positions: positionsPayload,
          movement: step.movement,
          stableFrames,
          stepDur,
          phaseDurations,
          workerSentAtAbs,
        })
        break
      }

      case WorkerMessageType.STOP:
        running = false
        break

      case WorkerMessageType.UPDATE_PHYSICS: {
        if (!state) return
        const prevPhysics = state.physics
        // Update physics config, namespace groups, and community assignments
        state.physics = { ...state.physics, ...data.physics }
        if (data.namespaceGroups !== undefined) {
          state.namespaceGroups = data.namespaceGroups ? new Map(data.namespaceGroups) : undefined
        }
        if (data.nodeCommunities !== undefined) {
          state.nodeCommunities = data.nodeCommunities ? new Map<string, number>(data.nodeCommunities) : undefined
        }

        // Instant reposition when clustering is toggled on
        const newPhysics = state.physics
        const { positions, velocities } = state

        // When clustering data changes, clear velocities so physics can quickly re-settle
        if (data.nodeCommunities !== undefined && state.nodeCommunities && state.nodeCommunities.size > 0) {
          for (const [id] of velocities) {
            const vel = velocities.get(id)
            if (vel) { vel[0] = 0; vel[1] = 0; vel[2] = 0 }
          }
        }

        // Reset stability counter when physics changes
        stableFrames = 0
        break
      }
    }
  }
}
