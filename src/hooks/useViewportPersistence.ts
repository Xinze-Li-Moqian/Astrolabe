// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from 'react'
import { getViewport, updateViewport, type ViewportData } from '@/lib/api'

export function useViewportPersistence({
    projectPath,
    filterOptions,
    setFilterOptions,
    setPhysics,
    graphNodes,
    customNodes,
    astrolabeEdges,
    customEdges,
    setSelectedNodeState,
    setEditingNote,
    setFocusNodeId,
    setSelectedEdge,
    setFocusEdgeId,
}: any) {
    const [initialViewport, setInitialViewport] = useState<ViewportData | null>(null)
    const [viewportLoaded, setViewportLoaded] = useState(false)

    const prevProjectPathRef = useRef<string | null>(null)
    const selectionRestoredRef = useRef(false)
    const filterOptionsInitializedRef = useRef(false)

    useEffect(() => {
        if (projectPath !== prevProjectPathRef.current) {
            prevProjectPathRef.current = projectPath
            setViewportLoaded(false)
            setInitialViewport(null)
            selectionRestoredRef.current = false
            filterOptionsInitializedRef.current = false
            setSelectedNodeState(null)
            setSelectedEdge(null)
        }
    }, [projectPath, setSelectedNodeState, setSelectedEdge])

    useEffect(() => {
        if (!projectPath || viewportLoaded) return

        getViewport(projectPath)
            .then((viewport) => {
                setInitialViewport(viewport)
                if (viewport.filter_options) {
                    setFilterOptions({
                        hideTechnical: viewport.filter_options.hideTechnical ?? false,
                        hideOrphaned: viewport.filter_options.hideOrphaned ?? false,
                        transitiveReduction: viewport.filter_options.transitiveReduction ?? true,
                    })
                }
                if (viewport.physics_settings) {
                    const ps = viewport.physics_settings
                    setPhysics((prev: any) => ({
                        ...prev,
                        ...(ps.repulsionStrength !== undefined && { repulsionStrength: ps.repulsionStrength }),
                        ...(ps.springLength !== undefined && { springLength: ps.springLength }),
                        ...(ps.springStrength !== undefined && { springStrength: ps.springStrength }),
                        ...(ps.centerStrength !== undefined && { centerStrength: ps.centerStrength }),
                        ...(ps.damping !== undefined && { damping: ps.damping }),
                        ...(ps.clusteringEnabled !== undefined && { clusteringEnabled: ps.clusteringEnabled }),
                        ...(ps.clusteringStrength !== undefined && { clusteringStrength: ps.clusteringStrength }),
                        ...(ps.clusterSeparation !== undefined && { clusterSeparation: ps.clusterSeparation }),
                        ...(ps.clusteringDepth !== undefined && { clusteringDepth: ps.clusteringDepth }),
                        ...(ps.adaptiveSpringEnabled !== undefined && { adaptiveSpringEnabled: ps.adaptiveSpringEnabled }),
                        ...(ps.adaptiveSpringMode !== undefined && { adaptiveSpringMode: ps.adaptiveSpringMode as 'sqrt' | 'logarithmic' | 'linear' }),
                        ...(ps.adaptiveSpringScale !== undefined && { adaptiveSpringScale: ps.adaptiveSpringScale }),
                    }))
                }
                setViewportLoaded(true)
            })
            .catch((err) => {
                console.error('[page] Failed to load viewport:', err)
                setViewportLoaded(true)
            })
    }, [projectPath, viewportLoaded, setFilterOptions, setPhysics])

    useEffect(() => {
        if (!initialViewport || graphNodes.length === 0 || selectionRestoredRef.current) return

        selectionRestoredRef.current = true

        if (initialViewport.selected_node_id) {
            const savedNode = graphNodes.find((n: any) => n.id === initialViewport.selected_node_id)
            if (savedNode) {
                setSelectedNodeState(savedNode)
                setEditingNote(savedNode.notes || '')
                setFocusNodeId(savedNode.id)
                console.log('[page] Restored selected node:', savedNode.id)
            }
        }

        if (initialViewport.selected_edge_id) {
            const parts = initialViewport.selected_edge_id.split('->')
            if (parts.length === 2) {
                const [sourceId, targetId] = parts
                const sourceNode = graphNodes.find((n: any) => n.id === sourceId) || customNodes.find((n: any) => n.id === sourceId)
                const targetNode = graphNodes.find((n: any) => n.id === targetId) || customNodes.find((n: any) => n.id === targetId)
                const edgeData = astrolabeEdges.find((e: any) => e.id === initialViewport.selected_edge_id)
                const customEdge = customEdges.find((e: any) => e.id === initialViewport.selected_edge_id)
                if (sourceNode && targetNode) {
                    setSelectedEdge({
                        id: initialViewport.selected_edge_id,
                        source: sourceId,
                        target: targetId,
                        sourceName: sourceNode.name,
                        targetName: targetNode.name,
                        notes: edgeData?.notes || customEdge?.notes,
                        style: edgeData?.style || customEdge?.style,
                        effect: edgeData?.effect || customEdge?.effect,
                        defaultStyle: edgeData?.defaultStyle || 'solid',
                    })
                    setFocusEdgeId(initialViewport.selected_edge_id)
                    console.log('[page] Restored selected edge:', initialViewport.selected_edge_id)
                }
            }
        }
    }, [initialViewport, graphNodes, customNodes, astrolabeEdges, customEdges, setSelectedNodeState, setEditingNote, setFocusNodeId, setSelectedEdge, setFocusEdgeId])

    const saveFilterTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    useEffect(() => {
        if (!projectPath || !viewportLoaded) return

        if (!filterOptionsInitializedRef.current) {
            filterOptionsInitializedRef.current = true
            return
        }

        if (saveFilterTimeoutRef.current) {
            clearTimeout(saveFilterTimeoutRef.current)
        }
        saveFilterTimeoutRef.current = setTimeout(() => {
            updateViewport(projectPath, {
                filter_options: {
                    hideTechnical: filterOptions.hideTechnical,
                    hideOrphaned: filterOptions.hideOrphaned,
                    transitiveReduction: filterOptions.transitiveReduction ?? true,
                },
            }).catch((err) => {
                console.error('[page] Failed to save filter options:', err)
            })
        }, 300)

        return () => {
            if (saveFilterTimeoutRef.current) {
                clearTimeout(saveFilterTimeoutRef.current)
            }
        }
    }, [projectPath, viewportLoaded, filterOptions])

    const saveCameraTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const lastCameraRef = useRef<{ position: [number, number, number]; target: [number, number, number]; saved: boolean } | null>(null)
    const handleCameraChange = useCallback((
        position: [number, number, number],
        target: [number, number, number]
    ) => {
        if (!projectPath) return

        lastCameraRef.current = { position, target, saved: false }

        if (saveCameraTimeoutRef.current) {
            clearTimeout(saveCameraTimeoutRef.current)
        }
        saveCameraTimeoutRef.current = setTimeout(() => {
            updateViewport(projectPath, {
                camera_position: position,
                camera_target: target,
            }).then(() => {
                if (lastCameraRef.current) {
                    lastCameraRef.current.saved = true
                }
            }).catch((err) => {
                console.error('[page] Failed to save camera position:', err)
            })
        }, 500)
    }, [projectPath])

    const projectPathRef = useRef(projectPath)
    projectPathRef.current = projectPath

    useEffect(() => {
        const saveBeforeUnload = () => {
            if (projectPathRef.current && lastCameraRef.current && !lastCameraRef.current.saved) {
                const data = JSON.stringify({
                    path: projectPathRef.current,
                    camera_position: lastCameraRef.current.position,
                    camera_target: lastCameraRef.current.target,
                })
                navigator.sendBeacon('http://127.0.0.1:8765/api/canvas/viewport', data)
            }
        }

        window.addEventListener('beforeunload', saveBeforeUnload)
        return () => {
            window.removeEventListener('beforeunload', saveBeforeUnload)
            if (projectPathRef.current && lastCameraRef.current && !lastCameraRef.current.saved) {
                updateViewport(projectPathRef.current, {
                    camera_position: lastCameraRef.current.position,
                    camera_target: lastCameraRef.current.target,
                }).catch(() => { })
            }
            if (saveCameraTimeoutRef.current) {
                clearTimeout(saveCameraTimeoutRef.current)
            }
        }
    }, [])

    return {
        initialViewport,
        viewportLoaded,
        handleCameraChange,
    }
}
