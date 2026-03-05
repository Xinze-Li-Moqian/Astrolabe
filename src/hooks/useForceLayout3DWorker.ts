/**
 * useForceLayout3DWorker - 3D Force Layout with Web Worker
 *
 * Offloads physics computation to a Web Worker for smooth rendering.
 * Falls back to main thread if Worker is not available.
 */

import { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import type { Node, Edge } from '@/lib/store'
import { WorkerMessageType, sabByteLength, SAB_DATA_OFFSET } from '@/lib/layout/ForceLayout3DWorker'
import type { PhysicsConfig, WorkerMessagePhaseDurations } from '@/lib/layout/ForceLayout3DWorker'
import { profiler } from '@/lib/profiler'

const SAB_AVAILABLE = typeof SharedArrayBuffer !== 'undefined'

/**
 * Extract namespace from node name at specified depth
 */
function extractNamespace(name: string, depth: number): string {
  if (!name || depth === 0) return name
  const parts = name.split('.')
  // Cap depth to parts.length - 1 so sibling leaf nodes always share a group.
  // e.g. "Real.sinc" with depth=2 → "Real" (not "Real.sinc")
  const nsDepth = Math.min(depth, parts.length - 1)
  if (nsDepth <= 0) return parts[0]
  return parts.slice(0, nsDepth).join('.')
}

/**
 * Group nodes by namespace (simplified version for worker)
 */
function groupNodesByNamespace(
  nodes: Node[],
  depth: number
): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const node of nodes) {
    const namespace = extractNamespace(node.name, depth)
    if (!groups.has(namespace)) {
      groups.set(namespace, [])
    }
    groups.get(namespace)!.push(node.id)
  }
  return groups
}

export interface UseForceLayout3DWorkerOptions {
  /** Physics parameters */
  physics?: Partial<PhysicsConfig>
  /** Auto-start on init */
  autoStart?: boolean
  /** Callback when simulation stabilizes */
  onStable?: () => void
  /** Callback on each position update */
  onUpdate?: () => void
  /** Use worker (default true, set false to use main thread) */
  useWorker?: boolean
  /** Node community assignments for community-aware layout */
  nodeCommunities?: Map<string, number> | null
}

const DEFAULT_PHYSICS: PhysicsConfig = {
  repulsionStrength: 200,
  springLength: 8,
  springStrength: 1.0,
  centerStrength: 0.05,
  damping: 0.8,
  clusteringEnabled: false,
  clusteringStrength: 10,
  clusterSeparation: 15,
  clusteringDepth: 1,
  adaptiveSpringEnabled: true,
  adaptiveSpringMode: 'sqrt',
  adaptiveSpringScale: 0.5,
  communityAwareLayout: false,
  boundaryRadius: 15,
  boundaryStrength: 2.0,
}

export interface UseForceLayout3DWorkerResult {
  /** Ref to current positions */
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>
  /** Start simulation */
  start: () => void
  /** Stop simulation */
  stop: () => void
  /** Whether simulation is running */
  isRunning: boolean
  /** Whether worker transport is available */
  workerEnabled: boolean
  /** Number of stable frames */
  stableFrames: number
  /** Re-initialize with new data */
  reinit: (nodes: Node[], edges: Edge[]) => void
}

export function useForceLayout3DWorker(
  nodes: Node[],
  edges: Edge[],
  options: UseForceLayout3DWorkerOptions = {}
): UseForceLayout3DWorkerResult {
  const {
    physics = {},
    autoStart = true,
    onStable,
    onUpdate,
    useWorker = true,
    nodeCommunities = null,
  } = options

  const positionsRef = useRef<Map<string, [number, number, number]>>(new Map())
  const velocitiesRef = useRef<Map<string, [number, number, number]>>(new Map())
  // Persistent cache of ALL positions ever seen — survives view switches so we
  // never lose positions for nodes that aren't in the current view.
  const positionCacheRef = useRef<Map<string, [number, number, number]>>(new Map())
  const workerRef = useRef<Worker | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const stepSeqRef = useRef(0)
  const stepInFlightRef = useRef(false)
  const [isRunning, setIsRunning] = useState(false)
  const [workerEnabled, setWorkerEnabled] = useState(() => useWorker && typeof Worker !== 'undefined')
  const [stableFrames, setStableFrames] = useState(0)

  // SharedArrayBuffer state — allocated once per init, reused every frame
  const sabRef = useRef<SharedArrayBuffer | null>(null)
  const sabViewRef = useRef<Float64Array | null>(null)
  const sabNodeIdsRef = useRef<string[] | null>(null)

  const onStableRef = useRef(onStable)
  const onUpdateRef = useRef(onUpdate)
  onStableRef.current = onStable
  onUpdateRef.current = onUpdate

  const mergedPhysics = useMemo<PhysicsConfig>(() => ({ ...DEFAULT_PHYSICS, ...physics }), [physics])

  // Compute a capped spread radius matching ForceLayout's targetRadius logic.
  const computeSpreadRadius = useCallback((nodeCount: number, edgeCount: number) => {
    const baseRadius = 12
    const dynamicRadius = Math.sqrt(nodeCount) * mergedPhysics.springLength * 0.5
    const maxRadius = edgeCount > 5000 ? 80 : edgeCount > 1000 ? 50 : 24
    return Math.min(maxRadius, Math.max(baseRadius, dynamicRadius)) * 1.2
  }, [mergedPhysics.springLength])

  // Place nodes on a Fibonacci spiral with progressive (cbrt) radius so they
  // fill a volume instead of sitting on a thin shell.  This matches ForceLayout's
  // pre-spread approach and gives the physics a much better starting layout.
  const spreadNodes = useCallback((
    ids: { id: string }[],
    spreadRadius: number,
    cx = 0, cy = 0, cz = 0,
  ): Map<string, [number, number, number]> => {
    const result = new Map<string, [number, number, number]>()
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    const n = ids.length
    ids.forEach((node, i) => {
      const theta = i * goldenAngle
      const phi = Math.acos(1 - (2 * (i + 0.5)) / Math.max(n, 1))
      // Progressive radius: inner → outer, avoids a uniform shell
      // Use cubic root to ensure uniform volume density
      const r = spreadRadius * (0.1 + 0.9 * Math.pow((i + 1) / n, 1/3))
      result.set(node.id, [
        cx + r * Math.sin(phi) * Math.cos(theta),
        cy + r * Math.sin(phi) * Math.sin(theta),
        cz + r * Math.cos(phi),
      ])
    })
    return result
  }, [])

  // Initialize positions — collects cached positions for known nodes and
  // identifies new nodes that need seeding.  The heavy trig work for new nodes
  // is deferred to the worker thread via the INIT message.
  const initPositions = useCallback((
    nodeList: Node[],
    preserveExisting = false,
    _edgeList?: Edge[],
  ) => {
    if (!preserveExisting) {
      // Full reset — worker will compute initial spread for all nodes.
      // Just set an empty map; start() sends newNodeIds = all nodes.
      positionsRef.current = new Map()
      velocitiesRef.current = new Map()
      return
    }

    // Incremental update — keep every node that already has a position.
    const currentPositions = positionsRef.current
    const currentVelocities = velocitiesRef.current
    const positions = new Map<string, [number, number, number]>()
    const velocities = new Map<string, [number, number, number]>()
    const cache = positionCacheRef.current

    for (const node of nodeList) {
      const pos = currentPositions.get(node.id) ?? cache.get(node.id)
      if (pos) {
        positions.set(node.id, pos)
        velocities.set(node.id, currentVelocities.get(node.id) || [0, 0, 0])
      }
      // Nodes without a position are NOT placed here — the worker will seed them.
    }

    positionsRef.current = positions
    velocitiesRef.current = velocities
  }, [])

  // Initialize worker
  const initWorker = useCallback(() => {
    if (!useWorker || typeof Worker === 'undefined') return null

    try {
      const worker = new Worker(
        new URL('../workers/forceLayout3D.worker.ts', import.meta.url),
        { type: 'module' }
      )

      worker.onmessage = (e) => {
        const {
          type,
          positions,
          stableFrames: sf,
          stepDur,
          phaseDurations,
          workerSentAtAbs,
        }: {
          type: string
          positions?: Array<[string, [number, number, number]]> | null
          stableFrames?: number
          stepDur?: number
          phaseDurations?: WorkerMessagePhaseDurations
          workerSentAtAbs?: number
        } = e.data

        if (type === WorkerMessageType.POSITIONS) {
          stepInFlightRef.current = false
          const receiveAtAbs = performance.timeOrigin + performance.now()

          const decodeStart = performance.now()
          let nodeCount = 0

          const sabView = sabViewRef.current
          const sabNodeIds = sabNodeIdsRef.current
          const cache = positionCacheRef.current
          if (sabView && sabNodeIds && !positions) {
            // SAB fast path: read positions directly from shared memory — zero copy
            const posMap = positionsRef.current
            for (let i = 0; i < sabNodeIds.length; i++) {
              const off = SAB_DATA_OFFSET + i * 3
              const x = sabView[off]
              const y = sabView[off + 1]
              const z = sabView[off + 2]
              const pos: [number, number, number] = [x, y, z]
              posMap.set(sabNodeIds[i], pos)
              cache.set(sabNodeIds[i], pos)
            }
            nodeCount = sabNodeIds.length
          } else if (positions) {
            // Structured-clone fallback
            const posMap = new Map<string, [number, number, number]>(positions)
            positionsRef.current = posMap
            for (const [id, pos] of posMap) {
              cache.set(id, pos)
            }
            nodeCount = posMap.size
          }

          const decodeDur = performance.now() - decodeStart

          if (sf !== undefined) {
            setStableFrames(sf)
          }
          onUpdateRef.current?.()

          // Push worker timing breakdown to profiler.
          if (phaseDurations) {
            const pushPhase = (name: string, dur: number, meta?: Record<string, number | string>) => {
              if (dur > 0.01) profiler.pushWorkerSpan(name, dur, meta)
            }
            pushPhase('worker.transfer.in', phaseDurations.transferIn)
            pushPhase('worker.layout.repulsion', phaseDurations.repulsion, { nodeCount })
            pushPhase('worker.layout.springs', phaseDurations.springs)
            pushPhase('worker.layout.center', phaseDurations.center)
            pushPhase('worker.layout.clustering', phaseDurations.clustering)
            pushPhase('worker.layout.integrate', phaseDurations.integrate, { nodeCount })
            pushPhase('worker.serialize.positions', phaseDurations.serialize, { nodeCount })
            if (typeof workerSentAtAbs === 'number') {
              const transferOut = Math.max(0, receiveAtAbs - workerSentAtAbs)
              pushPhase('worker.transfer.out', transferOut)
            }
          } else if (stepDur !== undefined) {
            profiler.pushWorkerSpan('worker.layout.total', stepDur, { nodeCount })
          }

          if (decodeDur > 0.01) {
            profiler.recordOneShot('worker.deserialize.positions', decodeDur, { nodeCount })
          }
        } else if (type === WorkerMessageType.STABLE) {
          onStableRef.current?.()
        }
      }

      worker.onerror = (err) => {
        stepInFlightRef.current = false
        console.error('[ForceLayout3DWorker] Worker error:', err)
      }

      return worker
    } catch (err) {
      console.warn('[ForceLayout3DWorker] Failed to create worker, using main thread:', err)
      return null
    }
  }, [useWorker])

  // Compute namespace groups for clustering (if enabled)
  const namespaceGroups = useMemo(() => {
    if (!mergedPhysics.clusteringEnabled) return null
    const depth = mergedPhysics.clusteringDepth || 1
    return groupNodesByNamespace(nodes, depth)
  }, [nodes, mergedPhysics.clusteringEnabled, mergedPhysics.clusteringDepth])

  // Start simulation
  const start = useCallback(() => {
    if (!workerRef.current) {
      setIsRunning(false)
      return
    }

    if (animationFrameRef.current !== null) return

    setIsRunning(true)
    setStableFrames(0)
    stepInFlightRef.current = false

    // Build the full list of node IDs for SAB + identify which need seeding
    const knownPositions = positionsRef.current
    const allNodeIds: string[] = []
    const newNodeIds: string[] = []
    for (const node of nodes) {
      allNodeIds.push(node.id)
      if (!knownPositions.has(node.id)) {
        newNodeIds.push(node.id)
      }
    }
    const totalNodeCount = allNodeIds.length
    if (totalNodeCount === 0) { setIsRunning(false); return }

    // Allocate SharedArrayBuffer for zero-copy position transfer (if available)
    let sab: SharedArrayBuffer | null = null
    if (SAB_AVAILABLE) {
      try {
        sab = new SharedArrayBuffer(sabByteLength(totalNodeCount))
        sabRef.current = sab
        sabViewRef.current = new Float64Array(sab)
        sabNodeIdsRef.current = allNodeIds
      } catch {
        sab = null
        sabRef.current = null
        sabViewRef.current = null
        sabNodeIdsRef.current = null
      }
    }

    // Send init to worker — known positions are sent directly, new nodes
    // are listed by ID so the worker can seed their positions off the main thread.
    workerRef.current.postMessage({
      type: WorkerMessageType.INIT,
      data: {
        positions: Array.from(knownPositions.entries()),
        velocities: Array.from(velocitiesRef.current.entries()),
        newNodeIds,
        edges: edges.map((e) => ({ source: e.source, target: e.target })),
        physics: mergedPhysics,
        namespaceGroups: namespaceGroups ? Array.from(namespaceGroups.entries()) : null,
        nodeCommunities: nodeCommunities ? Array.from(nodeCommunities.entries()) : null,
        sab,
        nodeIds: sab ? allNodeIds : null,
      },
    })

    // Request steps at display refresh rate.
    const requestStep = () => {
      if (!workerRef.current) return
      if (stepInFlightRef.current) {
        animationFrameRef.current = requestAnimationFrame(requestStep)
        return
      }

      stepInFlightRef.current = true
      stepSeqRef.current++
      workerRef.current.postMessage({
        type: WorkerMessageType.STEP,
        data: {
          stepId: stepSeqRef.current,
          clientSentAtAbs: performance.timeOrigin + performance.now(),
        },
      })
      animationFrameRef.current = requestAnimationFrame(requestStep)
    }
    requestStep()
  }, [edges, mergedPhysics, namespaceGroups, nodeCommunities])

  // Stop simulation
  const stop = useCallback(() => {
    setIsRunning(false)

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    stepInFlightRef.current = false
    sabRef.current = null
    sabViewRef.current = null
    sabNodeIdsRef.current = null

    if (workerRef.current) {
      workerRef.current.postMessage({ type: WorkerMessageType.STOP })
    }
  }, [])

  // Reinitialize with new data, preserving positions for nodes that already exist
  const reinit = useCallback(
    (newNodes: Node[], newEdges: Edge[]) => {
      stop()
      initPositions(newNodes, true, newEdges)

      if (workerRef.current && autoStart) {
        // Small delay to ensure positions are set
        setTimeout(() => start(), 0)
      }
    },
    [stop, initPositions, autoStart, start]
  )

  // Setup on mount
  useEffect(() => {
    initPositions(nodes, false, edges)
    workerRef.current = initWorker()
    setWorkerEnabled(!!workerRef.current)

    if (autoStart && workerRef.current) {
      // Small delay to ensure positions are initialized
      const timer = setTimeout(() => start(), 50)
      return () => clearTimeout(timer)
    }
  }, []) // Only on mount

  // Track previous physics/community state to detect changes
  const prevPhysicsRef = useRef<string>('')

  // Update worker when physics or community assignments change
  useEffect(() => {
    const commSize = nodeCommunities?.size ?? 0
    const physicsKey = JSON.stringify(mergedPhysics) + `:ns=${namespaceGroups?.size ?? 0}:comm=${commSize}`
    if (prevPhysicsRef.current && prevPhysicsRef.current !== physicsKey && workerRef.current && isRunning) {
      // Physics changed, send update to worker
      workerRef.current.postMessage({
        type: WorkerMessageType.UPDATE_PHYSICS,
        data: {
          physics: mergedPhysics,
          namespaceGroups: namespaceGroups ? Array.from(namespaceGroups.entries()) : null,
          nodeCommunities: nodeCommunities ? Array.from(nodeCommunities.entries()) : null,
        },
      })
      console.log('[ForceLayout3DWorker] Physics updated:', mergedPhysics)
    }
    prevPhysicsRef.current = physicsKey
  }, [mergedPhysics, namespaceGroups, nodeCommunities, isRunning])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop()
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [stop])

  return {
    positionsRef,
    start,
    stop,
    isRunning,
    workerEnabled,
    stableFrames,
    reinit,
  }
}

export default useForceLayout3DWorker
