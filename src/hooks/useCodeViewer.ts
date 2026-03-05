import { useState, useEffect, useCallback } from 'react'
import { readFullFile, type FileContent } from '@/lib/api'

export interface CodeLocation {
    filePath: string
    lineNumber: number
}

export function useCodeViewer(projectPath: string, selectedNode: { leanFilePath?: string; leanLineNumber?: number } | null) {
    const [codeViewerOpen, setCodeViewerOpen] = useState(false)
    const [codeFile, setCodeFile] = useState<FileContent | null>(null)
    const [codeLoading, setCodeLoading] = useState(false)
    const [codeDirty, setCodeDirty] = useState(false)
    // Independent code location for edge selection (overrides selectedNode location when set)
    const [codeLocation, setCodeLocation] = useState<CodeLocation | null>(null)
    // Code view mode: 'code' for Lean code, 'notes' for Markdown notes
    const [codeViewMode, setCodeViewMode] = useState<'code' | 'notes'>('code')

    // Automatically load code when codeViewerOpen is true
    // Priority: codeLocation (from edge selection) > selectedNode location
    useEffect(() => {
        const filePath = codeLocation?.filePath || selectedNode?.leanFilePath
        if (!codeViewerOpen || !filePath) {
            return
        }

        const loadCode = async () => {
            setCodeLoading(true)
            try {
                const result = await readFullFile(filePath)
                setCodeFile(result)
            } catch (error) {
                console.error('Failed to read file:', error)
                setCodeFile({
                    content: '-- Failed to load file',
                    startLine: 1,
                    endLine: 1,
                    totalLines: 1,
                })
            } finally {
                setCodeLoading(false)
            }
        }

        loadCode()
    }, [codeViewerOpen, codeLocation?.filePath, codeLocation?.lineNumber, selectedNode?.leanFilePath, selectedNode?.leanLineNumber])

    // Handle code editing changes
    const handleCodeChange = useCallback(async (newContent: string) => {
        setCodeFile(prev => prev ? { ...prev, content: newContent } : null)
        setCodeDirty(true)
    }, [])

    // Save file to disk (placeholder - file saving not implemented yet)
    const handleSaveFile = useCallback(async () => {
        if (!projectPath || !selectedNode?.leanFilePath || !codeFile) {
            return
        }
        // TODO: Implement file saving via Tauri API
        console.warn('[Save] File saving not implemented yet')
        setCodeDirty(false)
    }, [projectPath, selectedNode?.leanFilePath, codeFile])

    // Ctrl+S keyboard shortcut for saving
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault()
                handleSaveFile()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleSaveFile])

    // Reset dirty state when switching files
    useEffect(() => {
        setCodeDirty(false)
    }, [selectedNode?.leanFilePath])

    // Clear codeLocation when selecting a node (use node's location instead)
    const clearCodeLocation = useCallback(() => {
        setCodeLocation(null)
    }, [])

    const toggleCodeViewer = useCallback(() => {
        setCodeViewerOpen(prev => !prev)
    }, [])

    return {
        codeViewerOpen,
        setCodeViewerOpen,
        codeFile,
        codeLoading,
        codeDirty,
        codeLocation,
        setCodeLocation,
        codeViewMode,
        setCodeViewMode,
        handleCodeChange,
        handleSaveFile,
        clearCodeLocation,
        toggleCodeViewer,
    }
}
