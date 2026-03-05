import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { graphActions } from '@/lib/history/graphActions'
import type { GraphNode, GraphLink } from '@/types/graph'
import type { CustomNode, CustomEdge } from '@/lib/canvasStore'

export interface NeighborsToolProps {
    selectedNode: GraphNode
    customEdges: CustomEdge[]
    graphLinks: GraphLink[]
    customNodes: CustomNode[]
    graphNodes: GraphNode[]
    visibleNodes: string[]
    navigateToNode: (id: string) => void
    typeColors: Record<string, string>
}

export function NeighborsTool({
    selectedNode, customEdges, graphLinks, customNodes,
    graphNodes, visibleNodes, navigateToNode, typeColors,
}: NeighborsToolProps) {
    // Collect all connected nodes with relationship info
    const customIncoming = customEdges.filter(e => e.target === selectedNode.id)
    const customOutgoing = customEdges.filter(e => e.source === selectedNode.id)
    const provenIncoming = graphLinks.filter(l => l.target === selectedNode.id)
    const provenOutgoing = graphLinks.filter(l => l.source === selectedNode.id)

    // Build neighbor list with relationship type
    const customNodeIds = new Set(customNodes.map(n => n.id))
    const neighborMap = new Map<string, { id: string; name: string; kind: string; relation: 'depends' | 'usedBy'; isCustom: boolean; isOnCanvas: boolean }>()

    // Depends on (incoming edges = this node depends on source)
    provenIncoming.forEach(e => {
        const node = graphNodes.find(n => n.id === e.source)
        neighborMap.set(e.source, {
            id: e.source,
            name: node?.name || e.source,
            kind: node?.type || 'unknown',
            relation: 'depends',
            isCustom: false,
            isOnCanvas: visibleNodes.includes(e.source)
        })
    })
    customIncoming.forEach(e => {
        const isCustomNode = customNodeIds.has(e.source)
        const customNode = customNodes.find(n => n.id === e.source)
        const node = graphNodes.find(n => n.id === e.source)
        neighborMap.set(e.source, {
            id: e.source,
            name: customNode?.name || node?.name || e.source,
            kind: isCustomNode ? 'custom' : (node?.type || 'unknown'),
            relation: 'depends',
            isCustom: true,
            isOnCanvas: visibleNodes.includes(e.source)
        })
    })

    // Used by (outgoing edges = target uses this node)
    provenOutgoing.forEach(e => {
        const node = graphNodes.find(n => n.id === e.target)
        neighborMap.set(e.target, {
            id: e.target,
            name: node?.name || e.target,
            kind: node?.type || 'unknown',
            relation: 'usedBy',
            isCustom: false,
            isOnCanvas: visibleNodes.includes(e.target)
        })
    })
    customOutgoing.forEach(e => {
        const isCustomNode = customNodeIds.has(e.target)
        const customNode = customNodes.find(n => n.id === e.target)
        const node = graphNodes.find(n => n.id === e.target)
        neighborMap.set(e.target, {
            id: e.target,
            name: customNode?.name || node?.name || e.target,
            kind: isCustomNode ? 'custom' : (node?.type || 'unknown'),
            relation: 'usedBy',
            isCustom: true,
            isOnCanvas: visibleNodes.includes(e.target)
        })
    })

    const neighborsList = Array.from(neighborMap.values())
    const closedNeighbors = neighborsList.filter(n => !n.isOnCanvas)
    const allOpen = closedNeighbors.length === 0

    if (neighborsList.length === 0) {
        return (
            <div className="text-xs text-white/40 text-center py-4">
                No neighbors found
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {/* Node list - click to toggle */}
            <div className="max-h-60 overflow-y-auto space-y-0.5">
                {neighborsList.map(node => {
                    const isCustomNode = customNodeIds.has(node.id)
                    return (
                        <div
                            key={node.id}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors hover:bg-white/10 ${node.isOnCanvas ? '' : 'opacity-40'}`}
                        >
                            {/* Toggle visibility button (not for custom nodes) */}
                            {!isCustomNode ? (
                                <button
                                    onClick={async () => {
                                        if (node.isOnCanvas) {
                                            await graphActions.removeNodeFromCanvas(node.id)
                                        } else {
                                            await graphActions.addNodeToCanvas(node.id)
                                        }
                                    }}
                                    className={`w-4 h-4 flex items-center justify-center rounded transition-colors ${
                                        node.isOnCanvas
                                            ? 'text-green-400/60 hover:text-red-400'
                                            : 'text-white/30 hover:text-green-400'
                                    }`}
                                    title={node.isOnCanvas ? 'Remove from canvas' : 'Add to canvas'}
                                >
                                    {node.isOnCanvas ? (
                                        <EyeIcon className="w-3.5 h-3.5" />
                                    ) : (
                                        <EyeSlashIcon className="w-3.5 h-3.5" />
                                    )}
                                </button>
                            ) : (
                                <div className="w-4" />
                            )}
                            {/* Relation indicator */}
                            <span className={`text-[9px] w-8 ${
                                node.relation === 'depends' ? 'text-cyan-400/60' : 'text-orange-400/60'
                            }`}>
                                {node.relation === 'depends' ? 'dep' : 'used'}
                            </span>
                            {/* Node name - clickable to navigate */}
                            <button
                                onClick={() => navigateToNode(node.id)}
                                className="text-xs truncate flex-1 text-left hover:underline"
                                style={{ color: node.kind === 'custom' ? '#888' : (typeColors[node.kind] || '#888') }}
                                title="Go to node"
                            >
                                {node.name}
                            </button>
                            {/* Custom badge */}
                            {node.isCustom && (
                                <span className="text-[8px] px-1 py-0.5 bg-gray-500/30 text-gray-400 rounded">
                                    custom
                                </span>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Toggle All button */}
            {(closedNeighbors.length > 0 || neighborsList.some(n => n.isOnCanvas && !customNodeIds.has(n.id))) && (
                <button
                    onClick={async () => {
                        if (allOpen) {
                            // Close all (except custom nodes)
                            for (const node of neighborsList) {
                                if (node.isOnCanvas && !customNodeIds.has(node.id)) {
                                    await graphActions.removeNodeFromCanvas(node.id)
                                }
                            }
                        } else {
                            // Open all closed
                            await graphActions.addNodesToCanvas(closedNeighbors.map(n => n.id))
                        }
                    }}
                    className={`w-full py-1.5 text-xs rounded transition-colors ${
                        allOpen
                            ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                            : 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
                    }`}
                >
                    {allOpen ? 'Close All' : 'Open All'}
                </button>
            )}
        </div>
    )
}
