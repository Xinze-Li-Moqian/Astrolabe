import { type Ref } from 'react'
import {
    CubeIcon,
} from '@heroicons/react/24/outline'
import NodeStylePanel from '@/components/NodeStylePanel'
import { EdgesTool } from '@/components/inspector/tools/EdgesTool'
import { NeighborsTool } from '@/components/inspector/tools/NeighborsTool'
import { NodeHeader, type ToolPanelView } from '@/components/inspector/NodeHeader'
import { NodeNotes } from '@/components/inspector/NodeNotes'
import type { GraphNode, GraphLink, AstrolabeEdge } from '@/types/graph'
import type { CustomNode, CustomEdge } from '@/lib/canvasStore'
import type { CodeLocation } from '@/hooks/useCodeViewer'
import type { SelectedEdge } from '@/components/inspector/types'

export interface NodeInspectorProps {
    selectedNode: GraphNode | null
    visibleNodes: string[]
    graphNodes: GraphNode[]
    customNodes: CustomNode[]
    setSelectedNode: (node: GraphNode | null) => void
    handleToggleToolView: (tool: 'edges' | 'notes' | 'style' | 'neighbors') => void
    toolPanelView: ToolPanelView
    typeColors: Record<string, string>
    handleStyleChange: (nodeId: string, style: { effect?: string; size?: number }) => void
    // NodeHeader-specific
    isEditingCustomNodeName: boolean
    customNodeNameInputRef: Ref<HTMLInputElement>
    editingCustomNodeNameValue: string
    setEditingCustomNodeNameValue: (v: string) => void
    saveCustomNodeName: () => void
    setIsEditingCustomNodeName: (v: boolean) => void
    // NodeNotes-specific
    editingNote: string
    notesExpanded: boolean
    setNotesExpanded: (v: boolean) => void
    codeViewerOpen: boolean
    // EdgesTool-specific
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
    selectedEdge: SelectedEdge | null
    astrolabeEdges: AstrolabeEdge[]
    setSelectedEdge: (e: SelectedEdge | null) => void
    setFocusEdgeId: (id: string | null) => void
    setCodeLocation: (loc: CodeLocation) => void
    setCodeViewerOpen: (v: boolean) => void
    navigateToNode: (id: string) => void
    handleEdgeStyleChange: (edgeId: string, style: { effect?: string; style?: string }) => void
    isRemovingNodes: boolean
}

export function NodeInspector(props: NodeInspectorProps) {
    const { selectedNode, toolPanelView, handleStyleChange } = props

    return (
        <>
            {selectedNode ? (
                <div className="flex-1 overflow-y-auto">
                    {/* Node Header */}
                    <div className="p-3 border-b border-white/10">
                        <NodeHeader
                            selectedNode={selectedNode}
                            visibleNodes={props.visibleNodes}
                            customNodes={props.customNodes}
                            setSelectedNode={props.setSelectedNode}
                            handleToggleToolView={props.handleToggleToolView}
                            toolPanelView={toolPanelView}
                            typeColors={props.typeColors}
                            isEditingCustomNodeName={props.isEditingCustomNodeName}
                            customNodeNameInputRef={props.customNodeNameInputRef}
                            editingCustomNodeNameValue={props.editingCustomNodeNameValue}
                            setEditingCustomNodeNameValue={props.setEditingCustomNodeNameValue}
                            saveCustomNodeName={props.saveCustomNodeName}
                            setIsEditingCustomNodeName={props.setIsEditingCustomNodeName}
                        />
                        <NodeNotes
                            editingNote={props.editingNote}
                            notesExpanded={props.notesExpanded}
                            setNotesExpanded={props.setNotesExpanded}
                            codeViewerOpen={props.codeViewerOpen}
                        />

                        {toolPanelView && toolPanelView !== 'notes' && (
                            <div className="mt-2 p-2 bg-black/20 rounded-md">
                                {toolPanelView === 'edges' && (
                                    <EdgesTool
                                        selectedNode={selectedNode}
                                        isAddingEdge={props.isAddingEdge}
                                        cancelAddingEdge={props.cancelAddingEdge}
                                        setAddingEdgeDirection={props.setAddingEdgeDirection}
                                        setIsAddingEdge={props.setIsAddingEdge}
                                        setIsRemovingNodes={props.setIsRemovingNodes}
                                        projectPath={props.projectPath}
                                        highlightedPath={props.highlightedPath}
                                        setHighlightedPath={props.setHighlightedPath}
                                        customEdges={props.customEdges}
                                        graphLinks={props.graphLinks}
                                        graphNodes={props.graphNodes}
                                        customNodes={props.customNodes}
                                        typeColors={props.typeColors}
                                        visibleNodes={props.visibleNodes}
                                        selectedEdge={props.selectedEdge}
                                        astrolabeEdges={props.astrolabeEdges}
                                        setSelectedEdge={props.setSelectedEdge}
                                        setFocusEdgeId={props.setFocusEdgeId}
                                        setCodeLocation={props.setCodeLocation}
                                        setCodeViewerOpen={props.setCodeViewerOpen}
                                        navigateToNode={props.navigateToNode}
                                        handleEdgeStyleChange={props.handleEdgeStyleChange}
                                    />
                                )}
                                {toolPanelView === 'style' && (
                                    <NodeStylePanel
                                        nodeId={selectedNode.id}
                                        initialSize={selectedNode.customSize ?? 1.0}
                                        initialEffect={selectedNode.customEffect}
                                        onStyleChange={handleStyleChange}
                                        compact
                                    />
                                )}
                                {toolPanelView === 'neighbors' && (
                                    <NeighborsTool
                                        selectedNode={selectedNode}
                                        customEdges={props.customEdges}
                                        graphLinks={props.graphLinks}
                                        customNodes={props.customNodes}
                                        graphNodes={props.graphNodes}
                                        visibleNodes={props.visibleNodes}
                                        navigateToNode={props.navigateToNode}
                                        typeColors={props.typeColors}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-white/40 p-4">
                    <CubeIcon className="w-12 h-12 mb-3 opacity-50" />
                    <p className="text-sm text-center">Select a node to view details</p>
                    <p className="text-xs text-center mt-1 text-white/30">Click on any node in the graph</p>
                </div>
            )}
        </>
    )
}
