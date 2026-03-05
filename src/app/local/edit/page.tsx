'use client'

// Install global error handlers early to suppress known harmless errors (Monaco "Canceled", etc.)
import '@/lib/errorSuppression'

import { useState, useEffect, useCallback, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Panel, PanelGroup } from 'react-resizable-panels'
import { useGraphData, type GraphNode } from '@/hooks/useGraphData'
import { useAnalysisData } from '@/hooks/useAnalysisData'
import { useEditorGraphData } from '@/hooks/useEditorGraphData'
import { useViewportPersistence } from '@/hooks/useViewportPersistence'
import { useEditorActions } from '@/hooks/useEditorActions'
import { useCodeViewer } from '@/hooks/useCodeViewer'
import { useNodeNotes } from '@/hooks/useNodeNotes'
import { useLspIndex } from '@/hooks/useLspIndex'
import { useDialogState } from '@/hooks/useDialogState'
import { groupNodesByNamespace } from '@/lib/graphProcessing'
import { EditorTopBar } from '@/components/local/edit/EditorTopBar'
import { EditorLeftSidebar } from '@/components/local/edit/EditorLeftSidebar'
import { EditorStatusBar } from '@/components/local/edit/EditorStatusBar'
import { EditorOverlays } from '@/components/local/edit/EditorOverlays'
import { TauriRequiredView, NoProjectSelectedView, ProjectNotSupportedView, ProjectNeedsInitView } from '@/components/local/edit/ProjectStateViews'
import { GraphViewport } from '@/components/canvas/GraphViewport'
import { InspectorPanel } from '@/components/inspector/InspectorPanel'
import type { SelectedEdge } from '@/components/inspector/types'
import { useCanvasStore } from '@/lib/canvasStore'
import { updateViewport } from '@/lib/api'

import type { PhysicsParams } from '@/components/graph3d/ForceGraph3D'
import { DEFAULT_PHYSICS } from '@/components/graph3d/ForceLayout'

import { useLensStore } from '@/lib/lensStore'

import { useUndoShortcut } from '@/hooks/useUndoShortcut'
import { graphActions } from '@/lib/history/graphActions'
import { viewportActions } from '@/lib/history/viewportActions'
import { useSelectionStore } from '@/lib/selectionStore'
import { highlightNamespaceUndoable, selectNodeUndoable } from '@/lib/history/selectionActions'

type ViewMode = '2d' | '3d'

function LocalEditorContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const projectPath = searchParams.get('path') || ''
    const projectName = projectPath.split('/').pop() || 'Project'

    // ── Tauri check ──
    const [isTauri, setIsTauri] = useState(false)
    useEffect(() => {
        setIsTauri(!!(window as any).__TAURI_INTERNALS__)
    }, [])

    // ── Panel / UI chrome state ──
    const [infoPanelOpen, setInfoPanelOpen] = useState(true)
    const [searchPanelOpen, setSearchPanelOpen] = useState(true)
    const [searchPanelKey, setSearchPanelKey] = useState(0)
    const [leftPanelMode, setLeftPanelMode] = useState<'search' | 'settings'>('settings')
    const [viewMode, setViewMode] = useState<ViewMode>('3d')
    const [toolPanelView, setToolPanelView] = useState<'edges' | 'notes' | 'style' | 'neighbors' | null>(null)

    // ── Focus targets ──
    const [focusNodeId, setFocusNodeId] = useState<string | null>(null)
    const [focusEdgeId, setFocusEdgeId] = useState<string | null>(null)
    const [focusClusterPosition, setFocusClusterPosition] = useState<[number, number, number] | null>(null)

    // ── Selection (via selectionStore, undoable) ──
    const highlightedNamespace = useSelectionStore(state => state.highlightedNamespace)
    const storeSelectedNodeId = useSelectionStore(state => state.selectedNodeId)

    // ── Canvas display toggles ──
    const [showLabels, setShowLabels] = useState(true)
    const [showBridges, setShowBridges] = useState(false)
    const [highlightedPath, setHighlightedPath] = useState<string[]>([])
    const getPositionsRef = useRef<(() => Map<string, [number, number, number]>) | null>(null)

    // ── Physics settings ──
    const [physics, setPhysics] = useState<PhysicsParams>({ ...DEFAULT_PHYSICS })

    // ── Undo/Redo ──
    useUndoShortcut()

    // ── Canvas store ──
    const {
        visibleNodes, customNodes, customEdges, positionsLoaded,
        setProjectPath: setCanvasProjectPath, loadCanvas, resetAllData,
    } = useCanvasStore()

    // ── Dialog / modal state (reducer) ──
    const dialogs = useDialogState()

    // ── Edge/node interaction modes ──
    const [isAddingEdge, setIsAddingEdge] = useState(false)
    const [addingEdgeDirection, setAddingEdgeDirection] = useState<'outgoing' | 'incoming'>('outgoing')
    const [isRemovingNodes, setIsRemovingNodes] = useState(false)

    // ── Edges panel collapse state ──
    const [customDepsExpanded, setCustomDepsExpanded] = useState(true)
    const [customUsedByExpanded, setCustomUsedByExpanded] = useState(true)
    const [provenDepsExpanded, setProvenDepsExpanded] = useState(true)
    const [provenUsedByExpanded, setProvenUsedByExpanded] = useState(true)

    // ── Analysis panel state ──
    const [sizeMappingMode, setSizeMappingMode] = useState<'default' | 'pagerank' | 'indegree' | 'depth' | 'bottleneck' | 'reachability' | 'betweenness' | 'clustering' | 'katz' | 'hub' | 'authority'>('default')
    const [sizeCurveControl, setSizeCurveControl] = useState({ x: 0.25, y: 0.75 })
    const [colorMappingMode, setColorMappingMode] = useState<'kind' | 'namespace' | 'community' | 'layer' | 'spectral' | 'curvature' | 'anomaly' | 'embedding' | 'motif'>('kind')
    const [layoutClusterMode, setLayoutClusterMode] = useState<'none' | 'namespace' | 'community' | 'layer' | 'spectral' | 'embedding' | 'curvature' | 'anomaly' | 'motif'>('none')

    // ── Graph data from backend ──
    const {
        nodes: astrolabeNodes, edges: astrolabeEdges,
        legacyNodes: graphNodes, links: graphLinks,
        loading: graphLoading, reload: reloadGraph, reloadMeta,
        projectStatus, needsInit, notSupported, recheckStatus,
        rawNodeCount, filterOptions, setFilterOptions, filterStats,
    } = useGraphData(projectPath)

    const { analysisData, analysisLoading } = useAnalysisData(projectPath, astrolabeNodes.length)

    // ── Auto-select lens for large graphs ──
    const autoSelectLens = useLensStore(state => state.autoSelectLens)
    const activeLensId = useLensStore(state => state.activeLensId)
    const hasAutoSelectedRef = useRef(false)
    useEffect(() => {
        if (!hasAutoSelectedRef.current && rawNodeCount > 300) {
            hasAutoSelectedRef.current = true
            autoSelectLens(rawNodeCount)
        }
    }, [rawNodeCount, autoSelectLens])
    useEffect(() => { hasAutoSelectedRef.current = false }, [projectPath])

    // ── LSP namespace index (extracted hook) ──
    const { namespaceIndex, lspBuilding, lspStatus, handleBuildLsp } = useLspIndex(projectPath, graphLoading, needsInit)

    // ── Selected node ──
    const [selectedNode, setSelectedNodeState] = useState<GraphNode | null>(null)
    const [nodeClickCount, setNodeClickCount] = useState(0)

    // ── Selected edge ──
    const [selectedEdge, setSelectedEdge] = useState<SelectedEdge | null>(null)

    // ── Code viewer (extracted hook) ──
    const codeViewer = useCodeViewer(projectPath, selectedNode)

    // ── Node notes (extracted hook) ──
    const notes = useNodeNotes(projectPath, selectedNode?.id ?? null)

    // ── setSelectedNode with side effects ──
    const setSelectedNode = useCallback((node: GraphNode | null) => {
        setSelectedNodeState(node)
        setNodeClickCount(c => c + 1)
        selectNodeUndoable(node?.id ?? null)

        const isOnCanvas = node && (
            visibleNodes.includes(node.id) || customNodes.some(cn => cn.id === node.id)
        )
        if (isOnCanvas) setFocusNodeId(node.id)

        if (node && selectedEdge) {
            if (node.id !== selectedEdge.source && node.id !== selectedEdge.target) {
                setSelectedEdge(null)
            }
        }
        if (projectPath) {
            updateViewport(projectPath, { selected_node_id: node?.id }).catch((err) => {
                console.error('[page] Failed to save selected node:', err)
            })
        }
    }, [visibleNodes, customNodes, projectPath, selectedEdge])

    // Sync selectedNode meta when graphNodes updates
    useEffect(() => {
        if (selectedNode && graphNodes.length > 0) {
            const updatedNode = graphNodes.find(n => n.id === selectedNode.id)
            if (updatedNode && (
                updatedNode.customSize !== selectedNode.customSize ||
                updatedNode.customEffect !== selectedNode.customEffect ||
                updatedNode.customColor !== selectedNode.customColor
            )) {
                setSelectedNodeState(updatedNode)
            }
        }
    }, [graphNodes, selectedNode])

    // Sync local selectedNode with store (for undo/redo)
    useEffect(() => {
        const currentId = selectedNode?.id ?? null
        if (storeSelectedNodeId !== currentId) {
            if (storeSelectedNodeId === null) {
                setSelectedNodeState(null)
            } else {
                const node = graphNodes.find(n => n.id === storeSelectedNodeId)
                    || customNodes.find(n => n.id === storeSelectedNodeId) as GraphNode | undefined
                if (node) {
                    setSelectedNodeState(node)
                    setNodeClickCount(c => c + 1)
                }
            }
        }
    }, [storeSelectedNodeId, graphNodes, customNodes, selectedNode?.id])

    // ── Custom edge handling ──
    const handleAddCustomEdge = useCallback(async (targetNodeId: string) => {
        if (!selectedNode || !isAddingEdge) return
        const source = addingEdgeDirection === 'outgoing' ? selectedNode.id : targetNodeId
        const target = addingEdgeDirection === 'outgoing' ? targetNodeId : selectedNode.id
        if (source === target) { setIsAddingEdge(false); return }
        try {
            const leanEdges = astrolabeEdges.map(e => ({ source: e.source, target: e.target }))
            const result = await graphActions.createCustomEdge(source, target, leanEdges)
            if (result.error) { alert(result.error) }
        } catch (err) {
            console.error('[page] Failed to create custom edge:', err)
        }
        setIsAddingEdge(false)
    }, [selectedNode, isAddingEdge, addingEdgeDirection, astrolabeEdges])

    const cancelAddingEdge = useCallback(() => { setIsAddingEdge(false) }, [])

    // ── Save custom node name ──
    const saveCustomNodeName = useCallback(async () => {
        if (!selectedNode || selectedNode.type !== 'custom' || !dialogs.editingCustomNodeNameValue.trim()) {
            dialogs.setIsEditingCustomNodeName(false)
            return
        }
        const newName = dialogs.editingCustomNodeNameValue.trim()
        if (newName !== selectedNode.name) {
            await graphActions.updateCustomNode(selectedNode.id, newName, selectedNode.name)
            setSelectedNodeState(prev => prev ? { ...prev, name: newName } : null)
        }
        dialogs.setIsEditingCustomNodeName(false)
    }, [selectedNode, dialogs.editingCustomNodeNameValue, dialogs.setIsEditingCustomNodeName])

    // ── Undoable filter/physics updates ──
    const updateFilterOptionsUndoable = useCallback(async (newOptions: typeof filterOptions) => {
        if (!projectPath) return
        await viewportActions.updateFilterOptions(projectPath, newOptions, filterOptions, setFilterOptions)
    }, [projectPath, filterOptions, setFilterOptions])

    const updatePhysicsUndoable = useCallback(async (newPhysics: typeof physics) => {
        if (!projectPath) return
        await viewportActions.updatePhysics(projectPath, newPhysics, physics, setPhysics)
    }, [projectPath, physics])

    // Auto-focus when node is added to canvas
    const prevVisibleNodesRef = useRef<string[]>([])
    useEffect(() => {
        if (selectedNode && visibleNodes.includes(selectedNode.id)) {
            if (!prevVisibleNodesRef.current.includes(selectedNode.id)) {
                setFocusNodeId(selectedNode.id)
            }
        }
        prevVisibleNodesRef.current = visibleNodes
    }, [visibleNodes, selectedNode])

    // ── Unified node selection entry point ──
    const selectNode = useCallback((node: GraphNode | null) => {
        setSelectedNode(node)
        setHighlightedPath([])
        codeViewer.clearCodeLocation()
        if (node) {
            notes.initNote(node.notes || '')
            if (node.leanFilePath) {
                codeViewer.setCodeViewerOpen(true)
                codeViewer.setCodeViewMode('code')
            }
        } else {
            notes.initNote('')
            codeViewer.setCodeViewerOpen(false)
        }
    }, [setSelectedNode, codeViewer, notes])

    // ── Style changes ──
    const handleStyleChange = useCallback(async (nodeId: string, style: { effect?: string; size?: number }) => {
        if (!projectPath) return
        const node = graphNodes.find(n => n.id === nodeId)
        const oldStyle = { effect: node?.customEffect, size: node?.customSize }
        try {
            await graphActions.updateNodeMeta(
                projectPath, nodeId,
                { size: style.size, effect: style.effect },
                { size: oldStyle.size, effect: oldStyle.effect },
                'Change node style'
            )
            reloadMeta()
            loadCanvas()
        } catch (err) {
            console.error('[handleStyleChange] Failed:', err)
        }
    }, [projectPath, reloadMeta, loadCanvas, graphNodes])

    const handleEdgeStyleChange = useCallback(async (edgeId: string, style: { effect?: string; style?: string }) => {
        if (!projectPath) return
        const edge = astrolabeEdges.find(e => e.id === edgeId) || customEdges.find(e => e.id === edgeId)
        const oldStyle = { effect: edge?.effect, style: edge?.style }
        try {
            await graphActions.updateEdgeMeta(
                projectPath, edgeId,
                { effect: style.effect, style: style.style },
                { effect: oldStyle.effect, style: oldStyle.style },
                'Change edge style'
            )
            reloadMeta()
            loadCanvas()
        } catch (err) {
            console.error('[handleEdgeStyleChange] Failed:', err)
        }
    }, [projectPath, reloadMeta, loadCanvas, astrolabeEdges, customEdges])

    // ── Tool panel toggle ──
    const handleToggleToolView = (tool: 'edges' | 'notes' | 'style' | 'neighbors') => {
        setToolPanelView(toolPanelView === tool ? null : tool)
    }

    const rightPanelVisible = infoPanelOpen || codeViewer.codeViewerOpen

    // ── Initialize canvasStore ──
    useEffect(() => {
        if (projectPath) { setCanvasProjectPath(projectPath); loadCanvas() }
    }, [projectPath, setCanvasProjectPath, loadCanvas])

    // ── Viewport persistence ──
    const { initialViewport, handleCameraChange } = useViewportPersistence({
        projectPath, filterOptions, setFilterOptions, setPhysics,
        graphNodes, customNodes, astrolabeEdges, customEdges,
        setSelectedNodeState, setEditingNote: notes.setEditingNote,
        setFocusNodeId, setSelectedEdge, setFocusEdgeId,
    })

    // ── Derived graph data ──
    const {
        typeColors, namespaceData, nodeCommunities, namespaceDepthPreview,
        canvasNodes, canvasEdges, namespacesOnCanvas,
        nodesWithHiddenNeighbors, visibleCustomNodes, visibleCustomEdges, nodeStatusLines,
    } = useEditorGraphData({
        astrolabeNodes, astrolabeEdges, visibleNodes, customNodes, customEdges,
        activeLensId, sizeMappingMode, sizeCurveControl, colorMappingMode, layoutClusterMode,
        analysisData, clusteringDepth: physics.clusteringDepth,
        showBridges, highlightedPath, selectedLeanFilePath: selectedNode?.leanFilePath,
    })

    // ── Namespace click ──
    const handleNamespaceClick = useCallback((namespace: string) => {
        if (!getPositionsRef.current) return
        const positions = getPositionsRef.current()
        const namespaceGroups = groupNodesByNamespace(canvasNodes as any, physics.clusteringDepth)
        const nodesInNamespace = namespaceGroups.get(namespace)
        if (!nodesInNamespace || nodesInNamespace.length === 0) return
        const nodeIds = new Set(nodesInNamespace.map((n: any) => n.id))
        let sumX = 0, sumY = 0, sumZ = 0, count = 0
        for (const node of nodesInNamespace) {
            const pos = positions.get(node.id)
            if (pos) { sumX += pos[0]; sumY += pos[1]; sumZ += pos[2]; count++ }
        }
        if (count > 0) {
            setFocusClusterPosition([sumX / count, sumY / count, sumZ / count])
            highlightNamespaceUndoable(namespace, nodeIds)
        }
    }, [canvasNodes, physics.clusteringDepth])

    // ── Editor actions ──
    const {
        handleToggleCodeViewer, handleGraphNodeSelect, handleGraphBackgroundClick,
        handleClearCanvas, toggleNodeToRemove: actionToggleNodeToRemove,
        selectAllNodesToRemove, deselectAllNodesToRemove, removeSelectedNodes, clearAllNodes,
        handleResetAllData, confirmResetAllData, handleCreateCustomNode,
        handleSearchResultSelect, handleEdgeSelect, navigateToNode,
        handleJumpToCode, handleJumpToNamespace, handleRefreshCanvas,
        toggleLabels, toggleBridges, openCustomNodeDialog, toggleRemoveMode,
    } = useEditorActions({
        projectPath, graphNodes, customNodes, customEdges, astrolabeEdges, visibleNodes,
        namespaceIndex, selectedNode, selectedEdge, isAddingEdge, isRemovingNodes,
        addingEdgeDirection, selectedNodesToRemove: dialogs.selectedNodesToRemove,
        canvasNodes, customNodeName: dialogs.customNodeName, highlightedNamespace,
        reloadGraph, loadCanvas, resetAllData, selectNode, setSelectedNode,
        handleAddCustomEdge, cancelAddingEdge, setSelectedEdge,
        setFocusNodeId, setFocusEdgeId, setFocusClusterPosition,
        setCodeLocation: codeViewer.setCodeLocation,
        setCodeViewerOpen: codeViewer.setCodeViewerOpen,
        setInfoPanelOpen, setToolPanelView, setSearchPanelKey,
        setShowCustomNodeDialog: dialogs.setShowCustomNodeDialog,
        setCustomNodeName: dialogs.setCustomNodeName,
        setShowResetConfirm: dialogs.setShowResetConfirm,
        setShowReloadPrompt: dialogs.setShowReloadPrompt,
        setShowClearCanvasDialog: dialogs.setShowClearCanvasDialog,
        setSelectedNodesToRemove: dialogs.setSelectedNodesToRemove,
        setShowLabels, setShowBridges, setIsRemovingNodes, setIsAddingEdge,
    })

    const goHome = useCallback(() => { router.push('/') }, [router])

    // ── Early returns for project state ──
    if (!isTauri) return <TauriRequiredView />
    if (!projectPath) return <NoProjectSelectedView onHome={goHome} />
    if (notSupported && projectStatus) {
        return <ProjectNotSupportedView projectName={projectName} message={projectStatus.message} onHome={goHome} />
    }
    if (needsInit && projectStatus) {
        return (
            <ProjectNeedsInitView
                projectName={projectName} projectPath={projectPath}
                projectStatus={projectStatus} onHome={goHome}
                onInitComplete={async () => { await recheckStatus(); reloadGraph() }}
            />
        )
    }

    return (
        <div className="h-screen flex flex-col bg-black text-white">
            <EditorTopBar
                projectName={projectName}
                searchPanelOpen={searchPanelOpen}
                infoPanelOpen={infoPanelOpen}
                codeViewerOpen={codeViewer.codeViewerOpen}
                onHome={goHome}
                onToggleSearchPanel={() => setSearchPanelOpen(!searchPanelOpen)}
                onToggleInfoPanel={() => setInfoPanelOpen(!infoPanelOpen)}
                onToggleCodeViewer={handleToggleCodeViewer}
            />

            <div className="flex-1 min-h-0 flex">
                <PanelGroup direction="horizontal" className="flex-1">
                    <EditorLeftSidebar
                        ctx={{
                            searchPanelOpen, leftPanelMode, setLeftPanelMode, searchPanelKey,
                            selectedNode, handleSearchResultSelect, viewMode,
                            filterOptions, updateFilterOptionsUndoable, physics, updatePhysicsUndoable,
                            analysisData, analysisLoading,
                            sizeMappingMode, setSizeMappingMode, sizeCurveControl, setSizeCurveControl,
                            colorMappingMode, setColorMappingMode, layoutClusterMode, setLayoutClusterMode,
                            namespaceDepthPreview, namespaceData, namespacesOnCanvas, handleNamespaceClick,
                            astrolabeNodes, visibleNodes, canvasNodes, handleClearCanvas, handleResetAllData,
                        }}
                    />

                    <Panel defaultSize={75} minSize={50}>
                        <GraphViewport
                            viewMode={viewMode}
                            positionsLoaded={positionsLoaded}
                            canvasNodes={canvasNodes}
                            canvasEdges={canvasEdges}
                            visibleCustomNodes={visibleCustomNodes}
                            visibleCustomEdges={visibleCustomEdges}
                            selectedNode={selectedNode}
                            focusNodeId={focusNodeId}
                            focusEdgeId={focusEdgeId}
                            focusClusterPosition={focusClusterPosition}
                            selectedEdge={selectedEdge}
                            highlightedNamespace={highlightedNamespace}
                            onNodeSelect={handleGraphNodeSelect}
                            onBackgroundClick={handleGraphBackgroundClick}
                            onEdgeSelect={handleEdgeSelect}
                            showLabels={showLabels}
                            initialCameraPosition={initialViewport?.camera_position}
                            initialCameraTarget={initialViewport?.camera_target}
                            onCameraChange={handleCameraChange}
                            physics={physics}
                            isAddingEdge={isAddingEdge}
                            isRemovingNodes={isRemovingNodes}
                            nodesWithHiddenNeighbors={nodesWithHiddenNeighbors}
                            getPositionsRef={getPositionsRef}
                            nodeCommunities={nodeCommunities}
                            onJumpToCode={handleJumpToCode}
                            onJumpToNamespace={handleJumpToNamespace}
                            projectPath={projectPath}
                            graphLoading={graphLoading}
                            toolbarProps={{
                                canvasNodeCount: canvasNodes.length,
                                totalNodeCount: graphNodes.length,
                                hideTechnical: filterOptions.hideTechnical,
                                removedNodes: filterStats.removedNodes,
                                orphanedNodes: filterStats.orphanedNodes,
                                onBuildLsp: handleBuildLsp,
                                lspBuilding,
                                graphLoading,
                                namespaceCount: namespaceIndex.size,
                                onRefresh: handleRefreshCanvas,
                                showLabels,
                                onToggleLabels: toggleLabels,
                                showBridges,
                                onToggleBridges: toggleBridges,
                                bridgesAvailable: !!analysisData.bridges && analysisData.bridges.length > 0,
                                onAddCustomNode: openCustomNodeDialog,
                                isRemovingNodes,
                                onToggleRemoveMode: toggleRemoveMode,
                            }}
                        />
                    </Panel>

                    <InspectorPanel
                        rightPanelVisible={rightPanelVisible}
                        infoPanelOpen={infoPanelOpen}
                        isAddingEdge={isAddingEdge}
                        setIsAddingEdge={setIsAddingEdge}
                        inspector={{
                            selectedNode, visibleNodes, graphNodes, customNodes, setSelectedNode,
                            handleToggleToolView, toolPanelView, typeColors, handleStyleChange,
                            isEditingCustomNodeName: dialogs.isEditingCustomNodeName,
                            customNodeNameInputRef: dialogs.customNodeNameInputRef,
                            editingCustomNodeNameValue: dialogs.editingCustomNodeNameValue,
                            setEditingCustomNodeNameValue: dialogs.setEditingCustomNodeNameValue,
                            saveCustomNodeName,
                            setIsEditingCustomNodeName: dialogs.setIsEditingCustomNodeName,
                            editingNote: notes.editingNote,
                            notesExpanded: notes.notesExpanded,
                            setNotesExpanded: notes.setNotesExpanded,
                            codeViewerOpen: codeViewer.codeViewerOpen,
                            isAddingEdge, cancelAddingEdge,
                            setAddingEdgeDirection, setIsAddingEdge, setIsRemovingNodes,
                            projectPath, highlightedPath, setHighlightedPath,
                            customEdges, graphLinks, selectedEdge, astrolabeEdges,
                            setSelectedEdge, setFocusEdgeId,
                            setCodeLocation: codeViewer.setCodeLocation,
                            setCodeViewerOpen: codeViewer.setCodeViewerOpen,
                            navigateToNode, handleEdgeStyleChange, isRemovingNodes,
                        }}
                        codeWorkspace={{
                            codeViewerOpen: codeViewer.codeViewerOpen,
                            codeViewMode: codeViewer.codeViewMode,
                            setCodeViewMode: codeViewer.setCodeViewMode,
                            codeDirty: codeViewer.codeDirty,
                            setCodeViewerOpen: codeViewer.setCodeViewerOpen,
                            codeLoading: codeViewer.codeLoading,
                            codeFile: codeViewer.codeFile,
                            codeLocation: codeViewer.codeLocation,
                            selectedNode, nodeClickCount, nodeStatusLines,
                            editingNote: notes.editingNote,
                            handleNoteChange: notes.handleNoteChange,
                        }}
                    />
                </PanelGroup>
            </div>

            <EditorStatusBar
                projectName={projectName}
                selectedNode={selectedNode}
                codeDirty={codeViewer.codeDirty}
            />

            <EditorOverlays
                ctx={{
                    showCustomNodeDialog: dialogs.showCustomNodeDialog,
                    setShowCustomNodeDialog: dialogs.setShowCustomNodeDialog,
                    customNodeName: dialogs.customNodeName,
                    setCustomNodeName: dialogs.setCustomNodeName,
                    handleCreateCustomNode,
                    showResetConfirm: dialogs.showResetConfirm,
                    setShowResetConfirm: dialogs.setShowResetConfirm,
                    confirmResetAllData,
                    showReloadPrompt: dialogs.showReloadPrompt,
                    setShowReloadPrompt: dialogs.setShowReloadPrompt,
                    showClearCanvasDialog: dialogs.showClearCanvasDialog,
                    setShowClearCanvasDialog: dialogs.setShowClearCanvasDialog,
                    canvasNodes,
                    selectedNodesToRemove: dialogs.selectedNodesToRemove,
                    toggleNodeToRemove: actionToggleNodeToRemove,
                    selectAllNodesToRemove,
                    deselectAllNodesToRemove,
                    removeSelectedNodes,
                    clearAllNodes,
                    lspStatus,
                    lspBuilding,
                }}
            />
        </div>
    )
}

export default function LocalEditPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-white/60">Loading...</div>
            </div>
        }>
            <LocalEditorContent />
        </Suspense>
    )
}
