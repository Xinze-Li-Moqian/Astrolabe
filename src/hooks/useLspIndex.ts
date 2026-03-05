import { useState, useEffect, useCallback } from 'react'
import { getNamespaceIndex, buildNamespaceIndex, type NamespaceLocation } from '@/lib/api'

export function useLspIndex(projectPath: string, graphLoading: boolean, needsInit: boolean) {
    const [namespaceIndex, setNamespaceIndex] = useState<Map<string, NamespaceLocation>>(new Map())
    const [lspBuilding, setLspBuilding] = useState(false)
    const [lspStatus, setLspStatus] = useState<string | null>(null)

    // Load existing namespace index when project is ready (does NOT auto-build)
    useEffect(() => {
        if (!projectPath || graphLoading || needsInit) return

        const loadNamespaceIndex = async () => {
            try {
                const result = await getNamespaceIndex(projectPath)
                if (result.namespaces.length > 0) {
                    const indexMap = new Map<string, NamespaceLocation>()
                    for (const ns of result.namespaces) {
                        indexMap.set(ns.name, ns)
                    }
                    setNamespaceIndex(indexMap)
                    console.log(`[LSP] Loaded ${result.namespaces.length} namespaces from lsp.json`)
                } else {
                    console.log('[LSP] No lsp.json cache found. Click LSP button to build.')
                }
            } catch (error) {
                console.warn('[LSP] Failed to load index:', error)
            }
        }

        loadNamespaceIndex()
    }, [projectPath, graphLoading, needsInit])

    // Manual LSP build function
    const handleBuildLsp = useCallback(async () => {
        if (!projectPath || lspBuilding) return

        setLspBuilding(true)
        setLspStatus('Connecting to Lean LSP...')
        console.log('[LSP] Building index...')

        try {
            setLspStatus('Building LSP cache (scanning files)...')
            const result = await buildNamespaceIndex(projectPath)
            console.log(`[LSP] Built index with ${result.count} namespaces, ${result.file_count} files`)
            setLspStatus(`LSP cache built: ${result.count} namespaces`)

            // Reload the index into memory
            const loaded = await getNamespaceIndex(projectPath)
            const indexMap = new Map<string, NamespaceLocation>()
            for (const ns of loaded.namespaces) {
                indexMap.set(ns.name, ns)
            }
            setNamespaceIndex(indexMap)

            // Clear status after a short delay
            setTimeout(() => setLspStatus(null), 3000)
        } catch (error) {
            console.error('[LSP] Failed to build index:', error)
            setLspStatus('LSP build failed')
            setTimeout(() => setLspStatus(null), 5000)
        } finally {
            setLspBuilding(false)
        }
    }, [projectPath, lspBuilding])

    return {
        namespaceIndex,
        lspBuilding,
        lspStatus,
        handleBuildLsp,
    }
}
