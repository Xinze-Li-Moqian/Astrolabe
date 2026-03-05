'use client'

/**
 * ForceLayoutWorker - 3D Force Layout with Web Worker
 *
 * Drop-in replacement for ForceLayout that uses a Web Worker
 * for physics computation, keeping the main thread free for rendering.
 *
 * Usage: Replace <ForceLayout .../> with <ForceLayoutWorker .../>
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Node, Edge } from '@/lib/store'
import { useForceLayout3DWorker } from '@/hooks/useForceLayout3DWorker'
import ForceLayout, { type PhysicsParams } from './ForceLayout'

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

interface ForceLayoutWorkerProps {
  nodes: Node[]
  edges: Edge[]
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>
  draggingNodeId: string | null
  setDraggingNodeId: (id: string | null) => void
  running?: boolean
  physics?: PhysicsParams
  savedPositionCount?: number
  onStable?: () => void
  onWarmupComplete?: () => void
  controlsRef?: React.RefObject<any>
  nodeCommunities?: Map<string, number> | null
}

export function ForceLayoutWorker({
  nodes,
  edges,
  positionsRef,
  draggingNodeId,
  setDraggingNodeId,
  running = true,
  physics,
  savedPositionCount = 0,
  onStable,
  onWarmupComplete,
  controlsRef,
  nodeCommunities,
}: ForceLayoutWorkerProps) {
  const { camera, raycaster, gl, pointer } = useThree()
  const dragPlane = useRef(new THREE.Plane())
  const dragStartPos = useRef<[number, number, number] | null>(null)
  const prevDragging = useRef<string | null>(null)
  const draggedNodePos = useRef<{ id: string; pos: [number, number, number] } | null>(null)
  const hasCalledWarmup = useRef(false)

  // Use Worker-based layout
  const {
    positionsRef: workerPositionsRef,
    start,
    stop,
    isRunning,
    workerEnabled,
    reinit,
  } = useForceLayout3DWorker(nodes, edges, {
    physics: physics
      ? {
          // Basic physics
          repulsionStrength: physics.repulsionStrength,
          springLength: physics.springLength,
          springStrength: physics.springStrength,
          centerStrength: physics.centerStrength,
          damping: physics.damping,
          // Namespace clustering
          clusteringEnabled: physics.clusteringEnabled,
          clusteringStrength: physics.clusteringStrength,
          clusterSeparation: physics.clusterSeparation,
          clusteringDepth: physics.clusteringDepth,
          // Adaptive spring length
          adaptiveSpringEnabled: physics.adaptiveSpringEnabled,
          adaptiveSpringMode: physics.adaptiveSpringMode,
          adaptiveSpringScale: physics.adaptiveSpringScale,
          // Community-aware layout
          communityAwareLayout: physics.communityAwareLayout,
          communitySameMultiplier: physics.communitySameMultiplier,
          communityCrossMultiplier: physics.communityCrossMultiplier,
          communityClusteringStrength: physics.communityClusteringStrength,
          communitySeparation: physics.communitySeparation,
          // Boundary constraint
          boundaryRadius: physics.boundaryRadius,
          boundaryStrength: physics.boundaryStrength,
        }
      : undefined,
    nodeCommunities,
    autoStart: running,
    onStable,
    onUpdate: () => {
      // Sync worker positions to the external positionsRef
      const workerPositions = workerPositionsRef.current
      for (const [id, pos] of workerPositions.entries()) {
        positionsRef.current.set(id, pos)
      }

      if (!hasCalledWarmup.current && workerPositions.size > 0) {
        hasCalledWarmup.current = true
        onWarmupComplete?.()
      }
    },
  })
  const reinitRef = useRef(reinit)
  reinitRef.current = reinit

  // Stable topology fingerprint (order-independent) to avoid reinitializing on array identity churn.
  const topologyKey = useMemo(() => {
    let nodeHash = 0
    let edgeHash = 0

    for (const node of nodes) {
      nodeHash ^= hashString(node.id)
    }

    for (const edge of edges) {
      edgeHash ^= hashString(`${edge.source}->${edge.target}`)
    }

    return `${nodes.length}:${edges.length}:${nodeHash}:${edgeHash}`
  }, [nodes, edges])

  // Handle running state changes
  useEffect(() => {
    if (!workerEnabled) return

    if (running && !isRunning) {
      start()
    } else if (!running && isRunning) {
      stop()
    }
  }, [workerEnabled, running, isRunning, start, stop])

  // Reinit when graph topology changes.
  useEffect(() => {
    if (!workerEnabled) return
    if (nodes.length > 0) {
      // Reset warmup gate so onWarmupComplete fires again after topology change.
      // ForceGraph3D resets layoutReady=false on lens/view changes, so we must
      // fire onWarmupComplete again once the new layout has positions.
      hasCalledWarmup.current = false

      // Merge any externally-set positions (e.g. from calculateBatchSpawnPositions
      // in ForceGraph3D's node lifecycle) into the worker's internal positionsRef
      // so initPositions can see them and preserve them.
      for (const [id, pos] of positionsRef.current.entries()) {
        if (!workerPositionsRef.current.has(id)) {
          workerPositionsRef.current.set(id, pos)
        }
      }
      reinitRef.current(nodes, edges)
    }
  }, [workerEnabled, topologyKey])

  // Global mouse release handling
  useEffect(() => {
    if (!workerEnabled) return

    const handlePointerUp = () => {
      if (draggingNodeId) {
        setDraggingNodeId(null)
        gl.domElement.style.cursor = 'auto'
      }
    }
    gl.domElement.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      gl.domElement.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [workerEnabled, draggingNodeId, setDraggingNodeId, gl.domElement])

  // Handle dragging (still on main thread for responsiveness)
  useFrame(() => {
    if (!running || !workerEnabled) return

    // Handle dragging
    if (draggingNodeId) {
      if (prevDragging.current !== draggingNodeId) {
        const startPos = positionsRef.current.get(draggingNodeId)
        if (startPos) {
          dragStartPos.current = [...startPos] as [number, number, number]
          const cameraDir = new THREE.Vector3()
          camera.getWorldDirection(cameraDir)
          dragPlane.current.setFromNormalAndCoplanarPoint(
            cameraDir.clone().negate(),
            new THREE.Vector3(...startPos)
          )
        }
        prevDragging.current = draggingNodeId
      }

      if (dragStartPos.current) {
        raycaster.setFromCamera(pointer, camera)
        const intersectPoint = new THREE.Vector3()
        const hit = raycaster.ray.intersectPlane(dragPlane.current, intersectPoint)
        if (hit) {
          const newPos: [number, number, number] = [
            intersectPoint.x,
            intersectPoint.y,
            intersectPoint.z,
          ]
          draggedNodePos.current = { id: draggingNodeId, pos: newPos }
          // Update position immediately for responsive dragging
          positionsRef.current.set(draggingNodeId, newPos)
        }
      }
    } else {
      prevDragging.current = null
      dragStartPos.current = null
      draggedNodePos.current = null
    }
  })

  // Fallback to main-thread layout if worker transport is unavailable.
  if (!workerEnabled) {
    return (
      <ForceLayout
        nodes={nodes}
        edges={edges}
        positionsRef={positionsRef}
        draggingNodeId={draggingNodeId}
        setDraggingNodeId={setDraggingNodeId}
        running={running}
        physics={physics}
        savedPositionCount={savedPositionCount}
        onStable={onStable}
        onWarmupComplete={onWarmupComplete}
        controlsRef={controlsRef}
        nodeCommunities={nodeCommunities}
      />
    )
  }

  return null
}

export default ForceLayoutWorker
