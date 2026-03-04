import { useReducer, useCallback, useRef } from 'react'

export interface DialogState {
    showCustomNodeDialog: boolean
    customNodeName: string
    showResetConfirm: boolean
    showReloadPrompt: boolean
    showClearCanvasDialog: boolean
    selectedNodesToRemove: Set<string>
    // Custom node name editing
    isEditingCustomNodeName: boolean
    editingCustomNodeNameValue: string
}

type DialogAction =
    | { type: 'OPEN_CUSTOM_NODE_DIALOG' }
    | { type: 'CLOSE_CUSTOM_NODE_DIALOG' }
    | { type: 'SET_CUSTOM_NODE_NAME'; name: string }
    | { type: 'OPEN_RESET_CONFIRM' }
    | { type: 'CLOSE_RESET_CONFIRM' }
    | { type: 'OPEN_RELOAD_PROMPT' }
    | { type: 'CLOSE_RELOAD_PROMPT' }
    | { type: 'OPEN_CLEAR_CANVAS_DIALOG' }
    | { type: 'CLOSE_CLEAR_CANVAS_DIALOG' }
    | { type: 'SET_NODES_TO_REMOVE'; nodes: Set<string> }
    | { type: 'TOGGLE_NODE_TO_REMOVE'; nodeId: string }
    | { type: 'START_EDITING_CUSTOM_NODE_NAME'; value: string }
    | { type: 'STOP_EDITING_CUSTOM_NODE_NAME' }
    | { type: 'SET_EDITING_CUSTOM_NODE_NAME_VALUE'; value: string }

const initialState: DialogState = {
    showCustomNodeDialog: false,
    customNodeName: '',
    showResetConfirm: false,
    showReloadPrompt: false,
    showClearCanvasDialog: false,
    selectedNodesToRemove: new Set(),
    isEditingCustomNodeName: false,
    editingCustomNodeNameValue: '',
}

function dialogReducer(state: DialogState, action: DialogAction): DialogState {
    switch (action.type) {
        case 'OPEN_CUSTOM_NODE_DIALOG':
            return { ...state, showCustomNodeDialog: true }
        case 'CLOSE_CUSTOM_NODE_DIALOG':
            return { ...state, showCustomNodeDialog: false, customNodeName: '' }
        case 'SET_CUSTOM_NODE_NAME':
            return { ...state, customNodeName: action.name }
        case 'OPEN_RESET_CONFIRM':
            return { ...state, showResetConfirm: true }
        case 'CLOSE_RESET_CONFIRM':
            return { ...state, showResetConfirm: false }
        case 'OPEN_RELOAD_PROMPT':
            return { ...state, showReloadPrompt: true }
        case 'CLOSE_RELOAD_PROMPT':
            return { ...state, showReloadPrompt: false }
        case 'OPEN_CLEAR_CANVAS_DIALOG':
            return { ...state, showClearCanvasDialog: true, selectedNodesToRemove: new Set() }
        case 'CLOSE_CLEAR_CANVAS_DIALOG':
            return { ...state, showClearCanvasDialog: false }
        case 'SET_NODES_TO_REMOVE':
            return { ...state, selectedNodesToRemove: action.nodes }
        case 'TOGGLE_NODE_TO_REMOVE': {
            const newSet = new Set(state.selectedNodesToRemove)
            if (newSet.has(action.nodeId)) {
                newSet.delete(action.nodeId)
            } else {
                newSet.add(action.nodeId)
            }
            return { ...state, selectedNodesToRemove: newSet }
        }
        case 'START_EDITING_CUSTOM_NODE_NAME':
            return { ...state, isEditingCustomNodeName: true, editingCustomNodeNameValue: action.value }
        case 'STOP_EDITING_CUSTOM_NODE_NAME':
            return { ...state, isEditingCustomNodeName: false }
        case 'SET_EDITING_CUSTOM_NODE_NAME_VALUE':
            return { ...state, editingCustomNodeNameValue: action.value }
        default:
            return state
    }
}

/**
 * Manages all dialog/modal state in a single reducer.
 * Returns the state plus convenience setters that match the old useState API
 * so downstream code doesn't need to change much.
 */
export function useDialogState() {
    const [state, dispatch] = useReducer(dialogReducer, initialState)
    const customNodeNameInputRef = useRef<HTMLInputElement>(null)

    // Convenience setters (backwards-compatible with old useState calls)
    const setShowCustomNodeDialog = useCallback((open: boolean) => {
        dispatch(open ? { type: 'OPEN_CUSTOM_NODE_DIALOG' } : { type: 'CLOSE_CUSTOM_NODE_DIALOG' })
    }, [])

    const setCustomNodeName = useCallback((name: string) => {
        dispatch({ type: 'SET_CUSTOM_NODE_NAME', name })
    }, [])

    const setShowResetConfirm = useCallback((open: boolean) => {
        dispatch(open ? { type: 'OPEN_RESET_CONFIRM' } : { type: 'CLOSE_RESET_CONFIRM' })
    }, [])

    const setShowReloadPrompt = useCallback((open: boolean) => {
        dispatch(open ? { type: 'OPEN_RELOAD_PROMPT' } : { type: 'CLOSE_RELOAD_PROMPT' })
    }, [])

    const setShowClearCanvasDialog = useCallback((open: boolean) => {
        dispatch(open ? { type: 'OPEN_CLEAR_CANVAS_DIALOG' } : { type: 'CLOSE_CLEAR_CANVAS_DIALOG' })
    }, [])

    const setSelectedNodesToRemove = useCallback((nodes: Set<string> | ((prev: Set<string>) => Set<string>)) => {
        if (typeof nodes === 'function') {
            // For functional updates, we need to read current state -- this is a compromise.
            // The reducer itself handles TOGGLE_NODE_TO_REMOVE for the common case.
            // For selectAll/deselectAll, callers should provide a direct Set.
            console.warn('[useDialogState] Functional setSelectedNodesToRemove is discouraged, use dispatch directly')
            return
        }
        dispatch({ type: 'SET_NODES_TO_REMOVE', nodes })
    }, [])

    const toggleNodeToRemove = useCallback((nodeId: string) => {
        dispatch({ type: 'TOGGLE_NODE_TO_REMOVE', nodeId })
    }, [])

    const setIsEditingCustomNodeName = useCallback((editing: boolean) => {
        if (!editing) {
            dispatch({ type: 'STOP_EDITING_CUSTOM_NODE_NAME' })
        }
    }, [])

    const startEditingCustomNodeName = useCallback((value: string) => {
        dispatch({ type: 'START_EDITING_CUSTOM_NODE_NAME', value })
    }, [])

    const setEditingCustomNodeNameValue = useCallback((value: string) => {
        dispatch({ type: 'SET_EDITING_CUSTOM_NODE_NAME_VALUE', value })
    }, [])

    return {
        ...state,
        customNodeNameInputRef,
        dispatch,
        // Setters
        setShowCustomNodeDialog,
        setCustomNodeName,
        setShowResetConfirm,
        setShowReloadPrompt,
        setShowClearCanvasDialog,
        setSelectedNodesToRemove,
        toggleNodeToRemove,
        setIsEditingCustomNodeName,
        startEditingCustomNodeName,
        setEditingCustomNodeNameValue,
    }
}
