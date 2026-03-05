'use client'

/**
 * InstancedNodeLayer - high-throughput node rendering for large graphs.
 *
 * Uses a single InstancedMesh draw call for nodes and keeps interaction support
 * via instanceId-based picking.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import type { Node } from '@/types/node'
import { getNodeColor } from '@/lib/store'

interface InstancedNodeLayerProps {
  nodes: Node[]
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>
  selectedNodeIds: ReadonlySet<string>
  dimmedNodeIds?: ReadonlySet<string> | null
  hoveredNodeId: string | null
  setHoveredNodeId: (id: string | null) => void
  setDraggingNodeId: (id: string | null) => void
  onNodeSelect: (node: Node) => void
  onNodeContextMenu?: (node: Node, clientX: number, clientY: number) => void
  isAddingEdge?: boolean
  isRemovingNodes?: boolean
  showLabels?: boolean
  labelsZoomedIn?: boolean
  labelNodeIds?: string[]
}

function formatLabel(node: Node): string {
  const raw = node.meta?.label || node.name
  return raw.includes('.') ? raw.split('.').join('.\n') : raw
}

function FloatingNodeLabel({
  node,
  positionsRef,
}: {
  node: Node
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>
}) {
  const groupRef = useRef<THREE.Group>(null)
  const size = (node.meta?.size ?? node.defaultSize) * 0.5
  const yOffset = size * 2

  useFrame(() => {
    const group = groupRef.current
    if (!group) return
    const pos = positionsRef.current.get(node.id)
    if (!pos) return
    group.position.set(pos[0], pos[1] + yOffset, pos[2])
  })

  return (
    <group ref={groupRef}>
      <Billboard>
        <Text
          fontSize={size * 0.7}
          color="#ffffff"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.02}
          outlineColor="#000000"
          textAlign="center"
          lineHeight={1.2}
        >
          {formatLabel(node)}
        </Text>
      </Billboard>
    </group>
  )
}

export function InstancedNodeLayer({
  nodes,
  positionsRef,
  selectedNodeIds,
  dimmedNodeIds,
  hoveredNodeId,
  setHoveredNodeId,
  setDraggingNodeId,
  onNodeSelect,
  onNodeContextMenu,
  isAddingEdge = false,
  isRemovingNodes = false,
  showLabels = false,
  labelsZoomedIn = false,
  labelNodeIds = [],
}: InstancedNodeLayerProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dragStartTimeRef = useRef<number>(0)
  const wasDraggingRef = useRef(false)
  const activeDragNodeIdRef = useRef<string | null>(null)
  const { gl } = useThree()

  const tempObject = useMemo(() => new THREE.Object3D(), [])
  const tempColor = useMemo(() => new THREE.Color(), [])
  const whiteColor = useMemo(() => new THREE.Color('#ffffff'), [])
  const dimColor = useMemo(() => new THREE.Color('#333333'), [])
  const removeColor = useMemo(() => new THREE.Color('#ff4444'), [])
  const edgeModeColor = useMemo(() => new THREE.Color('#8ab4ff'), [])

  const nodeSizes = useMemo(
    () => nodes.map((node) => (node.meta?.size ?? node.defaultSize) * 0.5),
    [nodes]
  )

  const baseColors = useMemo(
    () => nodes.map((node) => new THREE.Color(getNodeColor(node))),
    [nodes]
  )

  const nodeById = useMemo(() => {
    const map = new Map<string, Node>()
    for (const node of nodes) map.set(node.id, node)
    return map
  }, [nodes])

  const labelNodes = useMemo(() => {
    if (!showLabels || !labelsZoomedIn || labelNodeIds.length === 0) return []
    const result: Node[] = []
    for (const id of labelNodeIds) {
      const node = nodeById.get(id)
      if (node) result.push(node)
    }
    return result
  }, [showLabels, labelsZoomedIn, labelNodeIds, nodeById])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    if (mesh.instanceColor) {
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
    }
  }, [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh || nodes.length === 0) return

    const positions = positionsRef.current
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      const pos = positions.get(node.id)
      if (!pos) {
        tempObject.position.set(0, 0, 0)
        tempObject.scale.setScalar(0.0001)
      } else {
        const isSelected = selectedNodeIds.has(node.id)
        const isHovered = hoveredNodeId === node.id
        const scaleMul = isSelected ? 1.25 : isHovered ? 1.12 : 1.0

        tempObject.position.set(pos[0], pos[1], pos[2])
        tempObject.scale.setScalar(nodeSizes[i] * scaleMul)
      }

      tempObject.updateMatrix()
      mesh.setMatrixAt(i, tempObject.matrix)

      const isSelected = selectedNodeIds.has(node.id)
      const isHovered = hoveredNodeId === node.id
      const isDimmed = dimmedNodeIds?.has(node.id) ?? false

      if (isRemovingNodes && !isSelected) {
        tempColor.copy(removeColor)
      } else if (isAddingEdge && !isSelected && !isHovered) {
        tempColor.copy(edgeModeColor)
      } else if (isDimmed) {
        tempColor.copy(dimColor)
      } else {
        tempColor.copy(baseColors[i])
      }

      if (isSelected) {
        tempColor.lerp(whiteColor, 0.35)
      } else if (isHovered) {
        tempColor.lerp(whiteColor, 0.2)
      }

      mesh.setColorAt(i, tempColor)
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  const getNodeFromEvent = (e: ThreeEvent<PointerEvent | MouseEvent>): Node | null => {
    if (e.instanceId === undefined || e.instanceId < 0 || e.instanceId >= nodes.length) return null
    return nodes[e.instanceId]
  }

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    const node = getNodeFromEvent(e)
    if (!node) return
    e.stopPropagation()

    const ne = e.nativeEvent as PointerEvent
    const isRightClick = ne.button === 2 || ne.buttons === 2
    const isCtrlClick = ne.button === 0 && ne.ctrlKey
    const isCmdClick = ne.button === 0 && ne.metaKey

    if ((isRightClick || isCtrlClick || isCmdClick) && node.id.startsWith('group:') && onNodeContextMenu) {
      ne.preventDefault()
      ;(ne as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
      onNodeContextMenu(node, (ne as unknown as MouseEvent).clientX, (ne as unknown as MouseEvent).clientY)
      return
    }

    if (ne.button === 0 && !ne.ctrlKey && !ne.metaKey) {
      dragStartTimeRef.current = Date.now()
      wasDraggingRef.current = false
      activeDragNodeIdRef.current = node.id
      setDraggingNodeId(node.id)
      gl.domElement.style.cursor = 'grabbing'
    }
  }

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (!activeDragNodeIdRef.current) return

    if (Date.now() - dragStartTimeRef.current > 150) {
      wasDraggingRef.current = true
    }

    setDraggingNodeId(null)
    activeDragNodeIdRef.current = null
    gl.domElement.style.cursor = 'auto'
  }

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    const node = getNodeFromEvent(e)
    if (!node) return
    e.stopPropagation()

    if (!wasDraggingRef.current) {
      onNodeSelect(node)
    }
    wasDraggingRef.current = false
  }

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    const node = getNodeFromEvent(e)
    if (!node) return
    e.stopPropagation()
    if (hoveredNodeId !== node.id) {
      setHoveredNodeId(node.id)
    }
    gl.domElement.style.cursor = node.id.startsWith('group:') ? 'pointer' : 'grab'
  }

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (hoveredNodeId !== null) setHoveredNodeId(null)
    gl.domElement.style.cursor = 'auto'
  }

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, nodes.length]}
        frustumCulled={false}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
      >
        <icosahedronGeometry args={[0.5, 1]} />
        <meshLambertMaterial color="#ffffff" />
      </instancedMesh>

      {labelNodes.map((node) => (
        <FloatingNodeLabel key={`instanced-label:${node.id}`} node={node} positionsRef={positionsRef} />
      ))}
    </>
  )
}

export default InstancedNodeLayer
