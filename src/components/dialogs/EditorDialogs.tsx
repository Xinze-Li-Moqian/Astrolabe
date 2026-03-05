type CustomNodeDialogProps = {
    isOpen: boolean
    onClose: () => void
    customNodeName: string
    setCustomNodeName: (name: string) => void
    handleCreateCustomNode: () => void
}

export function CustomNodeDialog({
    isOpen,
    onClose,
    customNodeName,
    setCustomNodeName,
    handleCreateCustomNode,
}: CustomNodeDialogProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/70" onClick={onClose} />
            <div className="relative bg-gray-900 rounded-lg p-6 w-96 border border-white/10 shadow-2xl">
                <h3 className="text-lg font-semibold text-white mb-4">Add Custom Node</h3>
                <p className="text-sm text-white/60 mb-4">
                    Custom nodes are displayed in gray and represent planned theorems or conjectures.
                </p>
                <input
                    type="text"
                    value={customNodeName}
                    onChange={(e) => setCustomNodeName(e.target.value)}
                    placeholder="Enter node name..."
                    className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded text-white text-sm placeholder-white/40 focus:outline-none focus:border-blue-500"
                    autoFocus
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            handleCreateCustomNode()
                        } else if (e.key === 'Escape') {
                            onClose()
                        }
                    }}
                />
                <div className="flex justify-end gap-2 mt-4">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreateCustomNode}
                        disabled={!customNodeName.trim()}
                        className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/30 disabled:text-white/30 text-white rounded transition-colors"
                    >
                        Create
                    </button>
                </div>
            </div>
        </div>
    )
}

type ResetConfirmDialogProps = {
    isOpen: boolean
    onClose: () => void
    confirmResetAllData: () => void
}

export function ResetConfirmDialog({ isOpen, onClose, confirmResetAllData }: ResetConfirmDialogProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/70" onClick={onClose} />
            <div className="relative bg-gray-900 rounded-lg p-6 w-96 border border-red-500/30 shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-white">Reset All Data</h3>
                </div>
                <p className="text-sm text-white/60 mb-2">This will permanently delete:</p>
                <ul className="text-sm text-red-400 mb-4 list-disc list-inside space-y-1">
                    <li>All custom nodes</li>
                    <li>All custom edges</li>
                    <li>All node metadata (colors, labels, notes)</li>
                </ul>
                <p className="text-sm text-white/40 mb-4">This action cannot be undone.</p>
                <div className="flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={confirmResetAllData}
                        className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                    >
                        Reset All Data
                    </button>
                </div>
            </div>
        </div>
    )
}

type ReloadPromptDialogProps = {
    isOpen: boolean
    onClose: () => void
}

export function ReloadPromptDialog({ isOpen, onClose }: ReloadPromptDialogProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/70" />
            <div className="relative bg-gray-900 rounded-lg p-6 w-96 border border-green-500/30 shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-white">Reset Complete</h3>
                </div>
                <p className="text-sm text-white/60 mb-4">
                    All data has been cleared. Click &quot;Reload&quot; to re-parse the project from Lean files and regenerate the graph.
                </p>
                <div className="flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                    >
                        Later
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
                    >
                        Reload Now
                    </button>
                </div>
            </div>
        </div>
    )
}

type ClearCanvasDialogProps = {
    isOpen: boolean
    onClose: () => void
    canvasNodes: any[]
    selectedNodesToRemove: Set<string>
    toggleNodeToRemove: (nodeId: string) => void
    selectAllNodesToRemove: () => void
    deselectAllNodesToRemove: () => void
    removeSelectedNodes: () => void
    clearAllNodes: () => void
}

export function ClearCanvasDialog({
    isOpen,
    onClose,
    canvasNodes,
    selectedNodesToRemove,
    toggleNodeToRemove,
    selectAllNodesToRemove,
    deselectAllNodesToRemove,
    removeSelectedNodes,
    clearAllNodes,
}: ClearCanvasDialogProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/70" onClick={onClose} />
            <div className="relative bg-gray-900 rounded-lg p-6 w-[480px] max-h-[80vh] border border-white/10 shadow-2xl flex flex-col">
                <h3 className="text-lg font-semibold text-white mb-4">Clear Canvas</h3>

                {canvasNodes.length === 0 ? (
                    <p className="text-sm text-white/60 mb-4">No nodes on canvas.</p>
                ) : (
                    <>
                        <div className="flex gap-2 mb-3">
                            <button
                                onClick={selectAllNodesToRemove}
                                className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 text-white/80 rounded transition-colors"
                            >
                                Select All
                            </button>
                            <button
                                onClick={deselectAllNodesToRemove}
                                className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 text-white/80 rounded transition-colors"
                            >
                                Deselect All
                            </button>
                            <span className="text-xs text-white/40 ml-auto self-center">
                                {selectedNodesToRemove.size} / {canvasNodes.length} selected
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto max-h-[300px] border border-white/10 rounded mb-4">
                            {canvasNodes.map((node) => (
                                <div
                                    key={node.id}
                                    onClick={() => toggleNodeToRemove(node.id)}
                                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${selectedNodesToRemove.has(node.id) ? 'bg-blue-500/20' : 'hover:bg-white/5'
                                        }`}
                                >
                                    <div
                                        className={`w-4 h-4 rounded border ${selectedNodesToRemove.has(node.id) ? 'bg-blue-500 border-blue-500' : 'border-white/30'
                                            } flex items-center justify-center`}
                                    >
                                        {selectedNodesToRemove.has(node.id) && (
                                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm truncate" style={{ color: node.defaultColor }}>
                                            {node.name}
                                        </div>
                                        <div className="text-xs text-white/40">{node.kind}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                <div className="flex justify-between gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={removeSelectedNodes}
                            disabled={selectedNodesToRemove.size === 0}
                            className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/30 disabled:text-white/30 text-white rounded transition-colors"
                        >
                            Remove Selected ({selectedNodesToRemove.size})
                        </button>
                        <button
                            onClick={clearAllNodes}
                            disabled={canvasNodes.length === 0}
                            className="px-4 py-2 text-sm bg-red-500/80 hover:bg-red-500 disabled:bg-red-500/30 disabled:text-white/30 text-white rounded transition-colors"
                        >
                            Clear All
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
