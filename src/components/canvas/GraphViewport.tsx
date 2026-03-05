'use client'

import dynamic from 'next/dynamic'
import { CanvasToolbar, type CanvasToolbarProps } from '@/components/canvas/CanvasToolbar'

const SigmaGraph = dynamic(() => import('@/components/graph/SigmaGraph'), {
    ssr: false,
    loading: () => (
        <div className="h-full flex items-center justify-center text-white/40 bg-black">
            Loading 2D graph...
        </div>
    ),
})

const ForceGraph3D = dynamic(() => import('@/components/graph3d/ForceGraph3D'), {
    ssr: false,
    loading: () => (
        <div className="h-full flex items-center justify-center text-white/40 bg-black">
            Loading 3D graph...
        </div>
    ),
})

type GraphViewportProps = {
    viewMode: '2d' | '3d'
    positionsLoaded: boolean
    canvasNodes: any[]
    canvasEdges: any[]
    visibleCustomNodes: any[]
    visibleCustomEdges: any[]
    selectedNode: any
    focusNodeId: string | null
    focusEdgeId: string | null
    focusClusterPosition: [number, number, number] | null
    selectedEdge: any
    highlightedNamespace: any
    onNodeSelect: (node: any) => void
    onBackgroundClick: () => void
    onEdgeSelect: (edge: { id: string; source: string; target: string } | null) => void
    showLabels: boolean
    initialCameraPosition?: [number, number, number] | null
    initialCameraTarget?: [number, number, number] | null
    onCameraChange: (position: [number, number, number], target: [number, number, number]) => void
    physics: any
    isAddingEdge: boolean
    isRemovingNodes: boolean
    nodesWithHiddenNeighbors: Set<string>
    getPositionsRef: any
    nodeCommunities: Map<string, any> | null
    onJumpToCode: (filePath: string, lineNumber: number) => void
    onJumpToNamespace: (namespace: string) => Promise<void> | void
    projectPath: string
    graphLoading: boolean
    toolbarProps: CanvasToolbarProps
}

export function GraphViewport({
    viewMode,
    positionsLoaded,
    canvasNodes,
    canvasEdges,
    visibleCustomNodes,
    visibleCustomEdges,
    selectedNode,
    focusNodeId,
    focusEdgeId,
    focusClusterPosition,
    selectedEdge,
    highlightedNamespace,
    onNodeSelect,
    onBackgroundClick,
    onEdgeSelect,
    showLabels,
    initialCameraPosition,
    initialCameraTarget,
    onCameraChange,
    physics,
    isAddingEdge,
    isRemovingNodes,
    nodesWithHiddenNeighbors,
    getPositionsRef,
    nodeCommunities,
    onJumpToCode,
    onJumpToNamespace,
    projectPath,
    graphLoading,
    toolbarProps,
}: GraphViewportProps) {
    const highlightedEdge = selectedEdge ? {
        id: selectedEdge.id,
        source: selectedEdge.source,
        target: selectedEdge.target,
    } : null

    return (
        <div className="h-full w-full overflow-hidden relative bg-[#0a0a0f]">
            {!positionsLoaded ? (
                <div className="h-full flex items-center justify-center text-white/40">
                    Loading canvas...
                </div>
            ) : canvasNodes.length === 0 && visibleCustomNodes.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-white/40">
                    <div className="text-lg mb-2">Canvas is empty</div>
                    <div className="text-sm">Search and add nodes from the left panel</div>
                </div>
            ) : viewMode === '3d' ? (
                <ForceGraph3D
                    nodes={canvasNodes}
                    edges={canvasEdges}
                    customNodes={visibleCustomNodes}
                    customEdges={visibleCustomEdges}
                    selectedNodeId={selectedNode?.id}
                    focusNodeId={focusNodeId}
                    focusEdgeId={focusEdgeId}
                    focusClusterPosition={focusClusterPosition}
                    highlightedEdge={highlightedEdge}
                    highlightedNamespace={highlightedNamespace}
                    onNodeSelect={onNodeSelect}
                    onBackgroundClick={onBackgroundClick}
                    onEdgeSelect={onEdgeSelect}
                    showLabels={showLabels}
                    initialCameraPosition={initialCameraPosition ?? undefined}
                    initialCameraTarget={initialCameraTarget ?? undefined}
                    onCameraChange={onCameraChange}
                    physics={physics}
                    isAddingEdge={isAddingEdge}
                    isRemovingNodes={isRemovingNodes}
                    nodesWithHiddenNeighbors={nodesWithHiddenNeighbors}
                    getPositionsRef={getPositionsRef}
                    nodeCommunities={nodeCommunities}
                    onJumpToCode={onJumpToCode}
                    onJumpToNamespace={onJumpToNamespace}
                />
            ) : (
                <SigmaGraph
                    nodes={canvasNodes}
                    edges={canvasEdges}
                    projectPath={projectPath}
                    onNodeClick={onNodeSelect}
                    onEdgeSelect={onEdgeSelect}
                    selectedNodeId={selectedNode?.id}
                    focusNodeId={focusNodeId}
                    highlightedEdge={highlightedEdge}
                    showLabels={showLabels}
                />
            )}

            {graphLoading && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20">
                    <div className="w-8 h-8 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin mb-4" />
                    <div className="text-white/80 text-sm font-mono">Loading project...</div>
                    <div className="text-white/40 text-xs mt-2">Parsing Lean files</div>
                </div>
            )}

            <CanvasToolbar {...toolbarProps} />
        </div>
    )
}
