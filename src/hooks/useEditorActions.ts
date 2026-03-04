// @ts-nocheck
import { useCallback } from 'react'
import { graphActions } from '@/lib/history/graphActions'
import { clearHighlightUndoable } from '@/lib/history/selectionActions'
import { updateViewport } from '@/lib/api'
import type { GraphNode } from '@/hooks/useGraphData'
import type { NodeKind } from '@/types/graph'
import type { SearchResult } from '@/lib/canvasStore'
import type { Node } from '@/lib/store'

export function useEditorActions(ctx: any) {
    const {
        projectPath,
        graphNodes,
        customNodes,
        customEdges,
        astrolabeEdges,
        visibleNodes,
        namespaceIndex,
        selectedNode,
        selectedEdge,
        isAddingEdge,
        isRemovingNodes,
        addingEdgeDirection,
        selectedNodesToRemove,
        canvasNodes,
        customNodeName,
        highlightedNamespace,
        reloadGraph,
        loadCanvas,
        resetAllData,
        selectNode,
        setSelectedNode,
        handleAddCustomEdge,
        cancelAddingEdge,
        setSelectedEdge,
        setFocusNodeId,
        setFocusEdgeId,
        setFocusClusterPosition,
        setCodeLocation,
        setCodeViewerOpen,
        setInfoPanelOpen,
        setToolPanelView,
        setSearchPanelKey,
        setShowCustomNodeDialog,
        setCustomNodeName,
        setShowResetConfirm,
        setShowReloadPrompt,
        setShowClearCanvasDialog,
        setSelectedNodesToRemove,
        setShowLabels,
        setShowBridges,
        setIsRemovingNodes,
        setIsAddingEdge,
    } = ctx

    const handleToggleCodeViewer = useCallback(() => {
        setCodeViewerOpen((prev: boolean) => !prev)
    }, [setCodeViewerOpen])

    const handleCanvasNodeClick = useCallback((node: Node | null) => {
        setSelectedEdge(null)

        if (!node) {
            if (isAddingEdge) {
                cancelAddingEdge()
            }
            if (isRemovingNodes) {
                setIsRemovingNodes(false)
            }
            setSelectedNode(null)
            setCodeViewerOpen(false)
            return
        }

        if (isRemovingNodes) {
            graphActions.removeNodeFromCanvas(node.id)
            if (selectedNode?.id === node.id) {
                setSelectedNode(null)
            }
            return
        }

        if (isAddingEdge && selectedNode) {
            handleAddCustomEdge(node.id)
            return
        }

        if (node.id.startsWith('group:')) {
            const namespace = node.id.replace('group:', '')
            setFocusNodeId(node.id)

            const cached = namespaceIndex.get(namespace)
            if (cached?.file_path && cached?.line_number) {
                console.log('[handleCanvasNodeClick] Using cached namespace location:', namespace)
                setCodeLocation({ filePath: cached.file_path, lineNumber: cached.line_number })
                setCodeViewerOpen(true)
                return
            }

            const fetchNamespaceDeclaration = async () => {
                try {
                    const response = await fetch(
                        `http://127.0.0.1:8765/api/project/namespace-declaration?` +
                        `path=${encodeURIComponent(projectPath)}&namespace=${encodeURIComponent(namespace)}`
                    )
                    if (response.ok) {
                        const data = await response.json()
                        console.log('[handleCanvasNodeClick] Namespace declaration from API:', namespace, data)
                        return { filePath: data.file_path, lineNumber: data.line_number }
                    }
                } catch (error) {
                    console.log('[handleCanvasNodeClick] API failed, falling back:', error)
                }

                const nodesInNamespace = graphNodes
                    .filter((gn: any) => gn.name.startsWith(namespace + '.') && gn.leanFilePath && gn.leanLineNumber)
                    .sort((a: any, b: any) => {
                        if (a.leanFilePath !== b.leanFilePath) {
                            return (a.leanFilePath || '').localeCompare(b.leanFilePath || '')
                        }
                        return (a.leanLineNumber || 0) - (b.leanLineNumber || 0)
                    })
                const firstNode = nodesInNamespace[0]
                console.log('[handleCanvasNodeClick] Fallback to first node:', firstNode?.name)
                return { filePath: firstNode?.leanFilePath, lineNumber: firstNode?.leanLineNumber }
            }

            fetchNamespaceDeclaration().then(({ filePath, lineNumber }) => {
                if (filePath && lineNumber) {
                    setCodeLocation({ filePath, lineNumber })
                    setCodeViewerOpen(true)
                    console.log('[handleCanvasNodeClick] Opening code at:', filePath, lineNumber)
                }
            })
            return
        }

        const customNode = customNodes.find((cn: any) => cn.id === node.id)
        if (customNode) {
            const fakeGraphNode: GraphNode = {
                id: customNode.id,
                name: customNode.name,
                type: 'custom',
                status: 'unknown',
                notes: customNode.notes,
                leanFilePath: undefined,
                leanLineNumber: undefined,
            }
            selectNode(fakeGraphNode)
            return
        }

        const graphNode = graphNodes.find((gn: any) => gn.id === node.id)
        if (graphNode) {
            selectNode(graphNode)
        }
    }, [graphNodes, customNodes, selectNode, setSelectedNode, isAddingEdge, selectedNode, handleAddCustomEdge, cancelAddingEdge, isRemovingNodes, setSelectedEdge, setIsRemovingNodes, setCodeViewerOpen, setFocusNodeId, namespaceIndex, projectPath, setCodeLocation])

    const handleGraphNodeSelect = useCallback((node: Node | null) => {
        if (highlightedNamespace && node && !highlightedNamespace.nodeIds.has(node.id)) {
            clearHighlightUndoable()
            setFocusClusterPosition(null)
        }
        handleCanvasNodeClick(node)
    }, [highlightedNamespace, handleCanvasNodeClick, setFocusClusterPosition])

    const handleGraphBackgroundClick = useCallback(() => {
        clearHighlightUndoable()
        setFocusClusterPosition(null)
    }, [setFocusClusterPosition])

    const handleClearCanvas = useCallback(() => {
        setSelectedNodesToRemove(new Set())
        setShowClearCanvasDialog(true)
    }, [setSelectedNodesToRemove, setShowClearCanvasDialog])

    const toggleNodeToRemove = useCallback((nodeId: string) => {
        setSelectedNodesToRemove((prev: Set<string>) => {
            const newSet = new Set(prev)
            if (newSet.has(nodeId)) {
                newSet.delete(nodeId)
            } else {
                newSet.add(nodeId)
            }
            return newSet
        })
    }, [setSelectedNodesToRemove])

    const selectAllNodesToRemove = useCallback(() => {
        const allIds = canvasNodes.map((n: any) => n.id)
        setSelectedNodesToRemove(new Set(allIds))
    }, [canvasNodes, setSelectedNodesToRemove])

    const deselectAllNodesToRemove = useCallback(() => {
        setSelectedNodesToRemove(new Set())
    }, [setSelectedNodesToRemove])

    const removeSelectedNodes = useCallback(async () => {
        for (const nodeId of selectedNodesToRemove) {
            await graphActions.removeNodeFromCanvas(nodeId)
        }
        setSelectedNodesToRemove(new Set())
        setSelectedNode(null)
        if (selectedNodesToRemove.size === canvasNodes.length) {
            setShowClearCanvasDialog(false)
        }
    }, [selectedNodesToRemove, setSelectedNode, canvasNodes.length, setSelectedNodesToRemove, setShowClearCanvasDialog])

    const clearAllNodes = useCallback(async () => {
        await graphActions.clearCanvas()
        setSelectedNode(null)
        setShowClearCanvasDialog(false)
    }, [setSelectedNode, setShowClearCanvasDialog])

    const handleResetAllData = useCallback(() => {
        setShowResetConfirm(true)
    }, [setShowResetConfirm])

    const confirmResetAllData = useCallback(async () => {
        await resetAllData()
        setSelectedNode(null)
        setShowResetConfirm(false)
        setShowReloadPrompt(true)
    }, [resetAllData, setSelectedNode, setShowResetConfirm, setShowReloadPrompt])

    const handleCreateCustomNode = useCallback(async () => {
        const name = customNodeName.trim()
        if (!name) return

        const id = `custom-${Date.now()}`
        await graphActions.createCustomNode(id, name)

        setShowCustomNodeDialog(false)
        setCustomNodeName('')
        console.log('[page] Created custom node:', id, name)
    }, [customNodeName, setShowCustomNodeDialog, setCustomNodeName])

    const handleSearchResultSelect = useCallback((result: SearchResult) => {
        if (result.kind === 'custom') {
            const customNode = customNodes.find((cn: any) => cn.id === result.id)
            if (customNode) {
                const fakeGraphNode: GraphNode = {
                    id: customNode.id,
                    name: customNode.name,
                    type: 'custom',
                    status: 'proven',
                    leanFilePath: '',
                    leanLineNumber: 0,
                    notes: customNode.notes || '',
                }
                selectNode(fakeGraphNode)
                setInfoPanelOpen(true)
                setFocusNodeId(customNode.id)
            }
            return
        }

        const isOnCanvas = visibleNodes.includes(result.id)
        const matchingNode = graphNodes.find((node: any) => node.id === result.id)

        const nodeToSelect: GraphNode = matchingNode || {
            id: result.id,
            name: result.name,
            type: result.kind as NodeKind,
            status: (result.status as any) || 'stated',
            leanFilePath: result.filePath,
            leanLineNumber: result.lineNumber,
            notes: '',
        }
        selectNode(nodeToSelect)
        setInfoPanelOpen(true)

        if (isOnCanvas) {
            setFocusNodeId(result.id)
        }
    }, [graphNodes, visibleNodes, selectNode, customNodes, setInfoPanelOpen, setFocusNodeId])

    const handleEdgeSelect = useCallback((edge: { id: string; source: string; target: string } | null) => {
        if (!edge) {
            setSelectedEdge(null)
            if (projectPath) {
                updateViewport(projectPath, { selected_edge_id: '' }).catch((err) => {
                    console.error('[page] Failed to clear selected edge:', err)
                })
            }
            return
        }
        const sourceNode = graphNodes.find((n: any) => n.id === edge.source) || customNodes.find((n: any) => n.id === edge.source)
        const targetNode = graphNodes.find((n: any) => n.id === edge.target) || customNodes.find((n: any) => n.id === edge.target)
        const edgeData = astrolabeEdges.find((e: any) => e.id === edge.id)
        const customEdge = customEdges.find((e: any) => e.id === edge.id)
        if (selectedEdge?.id === edge.id) {
            setSelectedEdge(null)
            if (projectPath) {
                updateViewport(projectPath, { selected_edge_id: '' }).catch((err) => {
                    console.error('[page] Failed to clear selected edge:', err)
                })
            }
        } else {
            setSelectedEdge({
                id: edge.id,
                source: edge.source,
                target: edge.target,
                sourceName: sourceNode?.name || edge.source,
                targetName: targetNode?.name || edge.target,
                style: edgeData?.style ?? customEdge?.style,
                effect: edgeData?.effect ?? customEdge?.effect,
                defaultStyle: edgeData?.defaultStyle ?? (customEdge ? 'dashed' : 'solid'),
                skippedNodes: edgeData?.skippedNodes,
            })
            setFocusEdgeId(edge.id)
            setToolPanelView('edges')
            const sourceGraphNode = graphNodes.find((n: any) => n.id === edge.source)
            if (sourceGraphNode?.leanFilePath && sourceGraphNode?.leanLineNumber) {
                setCodeLocation({
                    filePath: sourceGraphNode.leanFilePath,
                    lineNumber: sourceGraphNode.leanLineNumber,
                })
                setCodeViewerOpen(true)
            }
            if (projectPath) {
                updateViewport(projectPath, { selected_edge_id: edge.id }).catch((err) => {
                    console.error('[page] Failed to save selected edge:', err)
                })
            }
        }
    }, [graphNodes, customNodes, astrolabeEdges, customEdges, selectedEdge, projectPath, setSelectedEdge, setFocusEdgeId, setToolPanelView, setCodeLocation, setCodeViewerOpen])

    const navigateToNode = useCallback((nodeId: string) => {
        const customNode = customNodes.find((cn: any) => cn.id === nodeId)
        if (customNode) {
            const fakeGraphNode: GraphNode = {
                id: customNode.id,
                name: customNode.name,
                type: 'custom',
                status: 'unknown',
                notes: customNode.notes,
                leanFilePath: undefined,
                leanLineNumber: undefined,
            }
            selectNode(fakeGraphNode)
            setFocusNodeId(customNode.id)
            return
        }

        const graphNode = graphNodes.find((n: any) => n.id === nodeId)
        if (graphNode) {
            selectNode(graphNode)
            setFocusNodeId(nodeId)
        }
    }, [graphNodes, customNodes, selectNode, setFocusNodeId])

    const handleJumpToCode = useCallback((filePath: string, lineNumber: number) => {
        setCodeLocation({ filePath, lineNumber })
        setCodeViewerOpen(true)
    }, [setCodeLocation, setCodeViewerOpen])

    const handleJumpToNamespace = useCallback(async (namespace: string) => {
        try {
            const response = await fetch(
                `http://127.0.0.1:8765/api/project/namespace-declaration?` +
                `path=${encodeURIComponent(projectPath)}&namespace=${encodeURIComponent(namespace)}`
            )
            if (response.ok) {
                const data = await response.json()
                console.log('[onJumpToNamespace] LSP result:', namespace, data)
                setCodeLocation({ filePath: data.file_path, lineNumber: data.line_number })
                setCodeViewerOpen(true)
                return
            }
        } catch (error) {
            console.log('[onJumpToNamespace] LSP API failed:', error)
        }

        const firstNode = graphNodes
            .filter((n: any) => n.name.startsWith(namespace + '.') && n.leanFilePath && n.leanLineNumber)
            .sort((a: any, b: any) => (a.leanLineNumber || 0) - (b.leanLineNumber || 0))[0]

        if (firstNode?.leanFilePath && firstNode?.leanLineNumber) {
            setCodeLocation({ filePath: firstNode.leanFilePath, lineNumber: firstNode.leanLineNumber })
            setCodeViewerOpen(true)
        }
    }, [projectPath, graphNodes, setCodeLocation, setCodeViewerOpen])

    const handleRefreshCanvas = useCallback(async () => {
        console.log('[Canvas] Refresh clicked')
        await reloadGraph()
        loadCanvas()
        setSearchPanelKey((k: number) => k + 1)
    }, [reloadGraph, loadCanvas, setSearchPanelKey])

    const toggleLabels = useCallback(() => {
        setShowLabels((prev: boolean) => !prev)
    }, [setShowLabels])

    const toggleBridges = useCallback(() => {
        setShowBridges((prev: boolean) => !prev)
    }, [setShowBridges])

    const openCustomNodeDialog = useCallback(() => {
        setShowCustomNodeDialog(true)
    }, [setShowCustomNodeDialog])

    const toggleRemoveMode = useCallback(() => {
        setIsRemovingNodes((prev: boolean) => {
            const next = !prev
            if (next) {
                setIsAddingEdge(false)
            }
            return next
        })
    }, [setIsRemovingNodes, setIsAddingEdge])

    return {
        handleToggleCodeViewer,
        handleCanvasNodeClick,
        handleGraphNodeSelect,
        handleGraphBackgroundClick,
        handleClearCanvas,
        toggleNodeToRemove,
        selectAllNodesToRemove,
        deselectAllNodesToRemove,
        removeSelectedNodes,
        clearAllNodes,
        handleResetAllData,
        confirmResetAllData,
        handleCreateCustomNode,
        handleSearchResultSelect,
        handleEdgeSelect,
        navigateToNode,
        handleJumpToCode,
        handleJumpToNamespace,
        handleRefreshCanvas,
        toggleLabels,
        toggleBridges,
        openCustomNodeDialog,
        toggleRemoveMode,
    }
}
