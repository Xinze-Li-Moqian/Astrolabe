import { useState, useCallback, useEffect, useRef } from 'react'
import { graphActions } from '@/lib/history/graphActions'

export function useNodeNotes(projectPath: string, selectedNodeId: string | null) {
    const [editingNote, setEditingNote] = useState<string>('')
    const [notesExpanded, setNotesExpanded] = useState(false)

    // Debounced auto-save
    const saveNoteTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const originalNoteRef = useRef<string>('') // Track original value for undo

    const handleNoteChange = useCallback((value: string) => {
        // Capture original value on first change (for undo)
        if (!saveNoteTimeoutRef.current && selectedNodeId) {
            originalNoteRef.current = editingNote
        }

        setEditingNote(value)

        if (saveNoteTimeoutRef.current) {
            clearTimeout(saveNoteTimeoutRef.current)
        }

        if (selectedNodeId && projectPath) {
            const nodeId = selectedNodeId
            const oldNotes = originalNoteRef.current

            saveNoteTimeoutRef.current = setTimeout(async () => {
                try {
                    await graphActions.updateNodeMeta(
                        projectPath,
                        nodeId,
                        { notes: value || undefined },
                        { notes: oldNotes || undefined },
                        'Edit notes'
                    )
                    originalNoteRef.current = value
                } catch (err) {
                    console.error('[handleNoteChange] Failed to sync note to backend:', err)
                }
            }, 500)
        }
    }, [selectedNodeId, projectPath, editingNote])

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (saveNoteTimeoutRef.current) {
                clearTimeout(saveNoteTimeoutRef.current)
            }
        }
    }, [])

    // Reset note when node changes
    const initNote = useCallback((notes: string) => {
        setEditingNote(notes)
        originalNoteRef.current = notes
    }, [])

    return {
        editingNote,
        setEditingNote,
        notesExpanded,
        setNotesExpanded,
        handleNoteChange,
        initNote,
    }
}
