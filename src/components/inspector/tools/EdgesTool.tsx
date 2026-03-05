import { ArrowLongRightIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline'
import EdgeStylePanel from '@/components/EdgeStylePanel'
import { graphActions } from '@/lib/history/graphActions'
import type { GraphNode, GraphLink, AstrolabeEdge } from '@/types/graph'
import type { CustomNode, CustomEdge } from '@/lib/canvasStore'
import type { CodeLocation } from '@/hooks/useCodeViewer'
import type { SelectedEdge } from '@/components/inspector/types'

export interface EdgesToolProps {
    selectedNode: GraphNode
    isAddingEdge: boolean
    cancelAddingEdge: () => void
    setAddingEdgeDirection: (d: 'outgoing' | 'incoming') => void
    setIsAddingEdge: (v: boolean) => void
    setIsRemovingNodes: (v: boolean) => void
    projectPath: string
    highlightedPath: string[]
    setHighlightedPath: (v: string[]) => void
    customEdges: CustomEdge[]
    graphLinks: GraphLink[]
    graphNodes: GraphNode[]
    customNodes: CustomNode[]
    typeColors: Record<string, string>
    visibleNodes: string[]
    selectedEdge: SelectedEdge | null
    astrolabeEdges: AstrolabeEdge[]
    setSelectedEdge: (e: SelectedEdge | null) => void
    setFocusEdgeId: (id: string | null) => void
    setCodeLocation: (loc: CodeLocation) => void
    setCodeViewerOpen: (v: boolean) => void
    navigateToNode: (id: string) => void
    handleEdgeStyleChange: (edgeId: string, style: { effect?: string; style?: string }) => void
}

export function EdgesTool({
    selectedNode, isAddingEdge, cancelAddingEdge, setAddingEdgeDirection,
    setIsAddingEdge, setIsRemovingNodes, projectPath, highlightedPath,
    setHighlightedPath, customEdges, graphLinks, graphNodes, customNodes,
    typeColors, visibleNodes, selectedEdge, astrolabeEdges, setSelectedEdge,
    setFocusEdgeId, setCodeLocation, setCodeViewerOpen, navigateToNode,
    handleEdgeStyleChange,
}: EdgesToolProps) {
    return (
        <div className="space-y-2">
            {/* Action buttons row */}
            <div className="flex gap-1">
                {/* Add Edge button / Adding mode indicator */}
                {isAddingEdge ? (
                    <div className="flex-1 p-1.5 bg-green-500/20 border border-green-500/30 rounded text-xs flex items-center justify-between">
                        <span className="text-green-400">Click node to connect</span>
                        <button onClick={cancelAddingEdge} className="text-white/50 hover:text-white">
                            <XMarkIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => {
                            setAddingEdgeDirection('outgoing')
                            setIsAddingEdge(true)
                            setIsRemovingNodes(false)
                        }}
                        className="flex-1 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs rounded transition-colors flex items-center justify-center gap-1"
                    >
                        <PlusIcon className="w-3.5 h-3.5" />
                        <span>Add Edge</span>
                    </button>
                )}
                {/* Highlight Path to Selected button */}
                <button
                    onClick={async () => {
                        if (!projectPath || !selectedNode) return
                        try {
                            const res = await fetch(
                                `http://127.0.0.1:8765/api/project/analysis/critical-path?path=${encodeURIComponent(projectPath)}&target=${encodeURIComponent(selectedNode.id)}`
                            )
                            if (res.ok) {
                                const data = await res.json()
                                if (data.data?.path) {
                                    setHighlightedPath(data.data.path)
                                }
                            }
                        } catch (e) {
                            console.error('Failed to fetch critical path:', e)
                        }
                    }}
                    className={`py-1.5 px-2 text-xs rounded transition-colors flex items-center gap-1 ${
                        highlightedPath.includes(selectedNode.id)
                            ? 'bg-yellow-500/30 text-yellow-400'
                            : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400'
                    }`}
                    title="Highlight longest dependency path to this node"
                >
                    <ArrowLongRightIcon className="w-3.5 h-3.5" />
                    <span>Path</span>
                </button>
            </div>

            {/* Unified Edges List */}
            {(() => {
                // Collect all incoming edges (depends on)
                const customIncoming = customEdges.filter(e => e.target === selectedNode.id)
                const provenIncoming = graphLinks.filter(l => l.target === selectedNode.id)
                // Collect all outgoing edges (used by)
                const customOutgoing = customEdges.filter(e => e.source === selectedNode.id)
                const provenOutgoing = graphLinks.filter(l => l.source === selectedNode.id)

                const totalIncoming = customIncoming.length + provenIncoming.length
                const totalOutgoing = customOutgoing.length + provenOutgoing.length

                const renderEdgeItem = (edge: CustomEdge | GraphLink, isCustom: boolean, direction: 'in' | 'out') => {
                    const nodeId = direction === 'in' ? edge.source : edge.target
                    const node: (GraphNode | CustomNode | undefined) = graphNodes.find(n => n.id === nodeId) || customNodes.find(cn => cn.id === nodeId)
                    const nodeName = node?.name || nodeId
                    const nodeKind = node ? ('kind' in node ? node.kind : ('type' in node ? node.type : undefined)) : undefined
                    const nodeColor = node ? (nodeKind === 'custom' ? '#666' : (nodeKind ? typeColors[nodeKind] || '#888' : '#888')) : '#888'
                    const isOnCanvas = node ? visibleNodes.includes(node.id) : false
                    const edgeId = isCustom ? (edge as CustomEdge).id : `${edge.source}->${edge.target}`
                    const isEdgeSelected = selectedEdge?.id === edgeId
                    // Check if this is a shortcut/virtual edge
                    const matchedAstrolabe = isCustom ? undefined : astrolabeEdges.find(e => e.id === edgeId || e.id === `virtual-${edgeId}`)
                    const skippedNodes = matchedAstrolabe?.skippedNodes
                    const isShortcut = skippedNodes && skippedNodes.length > 0

                    return (
                        <div
                            key={edgeId}
                            onClick={() => {
                                if (isEdgeSelected) {
                                    setSelectedEdge(null)
                                    setFocusEdgeId(null)
                                } else {
                                    const resolvedEdge = matchedAstrolabe ?? (isCustom ? edge as CustomEdge : undefined)
                                    setSelectedEdge({
                                        id: matchedAstrolabe?.id ?? (isCustom ? (edge as CustomEdge).id : edgeId),
                                        source: edge.source,
                                        target: edge.target,
                                        sourceName: direction === 'in' ? nodeName : selectedNode.name,
                                        targetName: direction === 'in' ? selectedNode.name : nodeName,
                                        style: resolvedEdge?.style,
                                        effect: resolvedEdge?.effect,
                                        defaultStyle: isCustom ? 'dashed' : (matchedAstrolabe?.defaultStyle ?? 'solid'),
                                        skippedNodes,
                                    })
                                    setFocusEdgeId(matchedAstrolabe?.id ?? edgeId)
                                    // Set code location to the other end node
                                    const otherNode = graphNodes.find(n => n.id === nodeId)
                                    if (otherNode?.leanFilePath && otherNode?.leanLineNumber) {
                                        setCodeLocation({
                                            filePath: otherNode.leanFilePath,
                                            lineNumber: otherNode.leanLineNumber,
                                        })
                                        setCodeViewerOpen(true)
                                    }
                                }
                            }}
                            className={`px-1.5 py-1 rounded text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors ${
                                isEdgeSelected
                                    ? 'bg-cyan-500/30 ring-1 ring-cyan-500/50'
                                    : isShortcut
                                        ? 'bg-cyan-500/10 hover:bg-cyan-500/20 ring-1 ring-cyan-500/20'
                                        : 'bg-white/5 hover:bg-white/10'
                            }`}
                        >
                            {/* Shortcut indicator */}
                            {isShortcut && <span className="text-cyan-400 text-[9px] flex-shrink-0" title={`Shortcut: skips ${skippedNodes?.length} technical node(s)`}>&#9889;</span>}
                            {/* Custom indicator */}
                            {isCustom && !isShortcut && <span className="w-2 h-0 border-t border-dashed border-gray-400 flex-shrink-0" title="Custom edge" />}
                            {/* Node name */}
                            <span
                                className={`font-mono flex-1 truncate ${isOnCanvas ? '' : 'opacity-50'}`}
                                style={{ color: nodeColor }}
                            >
                                {nodeName.split('.').pop()}
                            </span>
                            {/* Goto button */}
                            {node && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); navigateToNode(nodeId) }}
                                    className="text-[9px] text-white/40 hover:text-cyan-300 transition-colors"
                                >
                                    &rarr;
                                </button>
                            )}
                            {/* Delete button for custom edges */}
                            {isCustom && (
                                <button
                                    onClick={(ev) => {
                                        ev.stopPropagation()
                                        const leanEdges = astrolabeEdges.map(e => ({ source: e.source, target: e.target }))
                                        graphActions.deleteCustomEdge((edge as CustomEdge).id, edge.source, edge.target, leanEdges)
                                    }}
                                    className="text-red-400/40 hover:text-red-400 transition-colors"
                                >
                                    <XMarkIcon className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    )
                }

                return (
                    <div className="space-y-2">
                        {/* Depends on */}
                        <div>
                            <div className="text-[10px] text-cyan-400/70 mb-1 flex items-center gap-1">
                                <ArrowLongRightIcon className="w-3 h-3 rotate-180" />
                                <span>Depends on ({totalIncoming})</span>
                            </div>
                            <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                {totalIncoming === 0 ? (
                                    <span className="text-[10px] text-white/30 pl-1">None</span>
                                ) : (
                                    <>
                                        {customIncoming.map(e => renderEdgeItem(e, true, 'in'))}
                                        {provenIncoming.map(e => renderEdgeItem(e, false, 'in'))}
                                    </>
                                )}
                            </div>
                        </div>
                        {/* Used by */}
                        <div>
                            <div className="text-[10px] text-orange-400/70 mb-1 flex items-center gap-1">
                                <ArrowLongRightIcon className="w-3 h-3" />
                                <span>Used by ({totalOutgoing})</span>
                            </div>
                            <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                {totalOutgoing === 0 ? (
                                    <span className="text-[10px] text-white/30 pl-1">None</span>
                                ) : (
                                    <>
                                        {customOutgoing.map(e => renderEdgeItem(e, true, 'out'))}
                                        {provenOutgoing.map(e => renderEdgeItem(e, false, 'out'))}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* Edge Style Panel */}
            {selectedEdge && (
                <div className="pt-2 border-t border-white/10">
                    {/* Shortcut Edge Info */}
                    {selectedEdge.skippedNodes && selectedEdge.skippedNodes.length > 0 && (
                        <div className="mb-3 p-2 bg-cyan-500/10 border border-cyan-500/30 rounded">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-cyan-400 text-xs font-medium">Shortcut Edge</span>
                                <span className="text-white/40 text-xs">
                                    ({selectedEdge.skippedNodes.length} hidden)
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {selectedEdge.skippedNodes.map(nodeId => {
                                    const node = graphNodes.find(n => n.id === nodeId)
                                    const displayName = node?.name?.split('.').pop() || nodeId.split('.').pop() || nodeId
                                    return (
                                        <span
                                            key={nodeId}
                                            className="px-1.5 py-0.5 bg-white/5 text-white/60 text-[10px] rounded truncate max-w-[100px]"
                                            title={node?.name || nodeId}
                                        >
                                            {displayName}
                                        </span>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                    <EdgeStylePanel
                        edgeId={selectedEdge.id}
                        sourceNode={selectedEdge.sourceName}
                        targetNode={selectedEdge.targetName}
                        initialStyle={selectedEdge.style ?? selectedEdge.defaultStyle}
                        initialEffect={selectedEdge.effect}
                        defaultStyle={selectedEdge.defaultStyle}
                        onStyleChange={handleEdgeStyleChange}
                        compact
                    />
                </div>
            )}
        </div>
    )
}
