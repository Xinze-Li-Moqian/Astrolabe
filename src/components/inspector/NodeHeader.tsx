import { type Ref } from 'react'
import {
    XMarkIcon,
    SwatchIcon,
    ArrowLongRightIcon,
    ArrowsPointingOutIcon,
    EyeIcon,
    EyeSlashIcon,
} from '@heroicons/react/24/outline'
import { graphActions } from '@/lib/history/graphActions'
import type { GraphNode } from '@/types/graph'
import type { CustomNode } from '@/lib/canvasStore'

export type ToolPanelView = 'edges' | 'notes' | 'style' | 'neighbors' | null

export interface NodeHeaderProps {
    selectedNode: GraphNode
    visibleNodes: string[]
    customNodes: CustomNode[]
    setSelectedNode: (node: GraphNode | null) => void
    handleToggleToolView: (tool: 'edges' | 'notes' | 'style' | 'neighbors') => void
    toolPanelView: ToolPanelView
    typeColors: Record<string, string>
    isEditingCustomNodeName: boolean
    customNodeNameInputRef: Ref<HTMLInputElement>
    editingCustomNodeNameValue: string
    setEditingCustomNodeNameValue: (v: string) => void
    saveCustomNodeName: () => void
    setIsEditingCustomNodeName: (v: boolean) => void
}

export function NodeHeader({
    selectedNode, visibleNodes, customNodes, setSelectedNode,
    handleToggleToolView, toolPanelView, typeColors,
    isEditingCustomNodeName, customNodeNameInputRef, editingCustomNodeNameValue,
    setEditingCustomNodeNameValue, saveCustomNodeName, setIsEditingCustomNodeName,
}: NodeHeaderProps) {
    return (
        <>
            <div className="flex items-center gap-2">
                <button
                    onClick={async () => {
                        const isVisible = visibleNodes.includes(selectedNode.id)
                        if (isVisible) {
                            await graphActions.removeNodeFromCanvas(selectedNode.id)
                        } else {
                            await graphActions.addNodeToCanvas(selectedNode.id)
                        }
                    }}
                    className={`p-0.5 rounded transition-all flex-shrink-0 ${
                        visibleNodes.includes(selectedNode.id)
                            ? 'text-green-400 hover:text-green-300 drop-shadow-[0_0_6px_rgba(74,222,128,0.8)]'
                            : 'text-gray-500 hover:text-gray-400 animate-pulse-glow'
                    }`}
                    title={visibleNodes.includes(selectedNode.id) ? 'Remove from canvas' : 'Add to canvas'}
                >
                    {visibleNodes.includes(selectedNode.id) ? (
                        <EyeIcon className="w-4 h-4" />
                    ) : (
                        <EyeSlashIcon className="w-4 h-4" />
                    )}
                </button>
                {(() => {
                    const isCustomNode = selectedNode.type === 'custom'
                    const color = isCustomNode ? '#666666' : (typeColors[selectedNode.type] || '#888')
                    const isOnCanvas = visibleNodes.includes(selectedNode.id)
                    return (
                        <span
                            className={`font-semibold transition-opacity flex-1 truncate ${isOnCanvas ? '' : 'opacity-40'}`}
                            style={{ color }}
                            title={selectedNode.name}
                        >
                            {selectedNode.name}
                        </span>
                    )
                })()}
                <div className={`flex gap-0.5 flex-shrink-0 transition-opacity ${
                    visibleNodes.includes(selectedNode.id) ? '' : 'opacity-40'
                }`}>
                    <button
                        onClick={() => handleToggleToolView('style')}
                        className={`p-0.5 rounded transition-colors ${
                            toolPanelView === 'style'
                                ? 'text-pink-300'
                                : 'text-white/30 hover:text-pink-400'
                        }`}
                        title="Style"
                    >
                        <SwatchIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => handleToggleToolView('edges')}
                        className={`p-0.5 rounded transition-colors ${
                            toolPanelView === 'edges'
                                ? 'text-blue-300'
                                : 'text-white/30 hover:text-blue-400'
                        }`}
                        title="Edges"
                    >
                        <ArrowLongRightIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => handleToggleToolView('neighbors')}
                        className={`p-0.5 rounded transition-colors ${
                            toolPanelView === 'neighbors'
                                ? 'text-purple-300'
                                : 'text-white/30 hover:text-purple-400'
                        }`}
                        title="Neighbors"
                    >
                        <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                    </button>
                </div>
                {(visibleNodes.includes(selectedNode.id) || selectedNode.type === 'custom') && (
                    <button
                        onClick={async () => {
                            if (confirm('Delete this node? This will remove it from canvas and clear its meta info.')) {
                                const isCustom = selectedNode.type === 'custom'
                                const customData = isCustom ? customNodes.find(n => n.id === selectedNode.id) : undefined
                                await graphActions.deleteNodeWithMeta(
                                    selectedNode.id,
                                    selectedNode.name,
                                    isCustom,
                                    customData
                                )
                                setSelectedNode(null)
                            }
                        }}
                        className="p-0.5 rounded transition-all flex-shrink-0 text-red-400 hover:text-red-300"
                        title="Delete node"
                    >
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                )}
            </div>

            {selectedNode.type === 'custom' && (
                <div className="mt-2">
                    {isEditingCustomNodeName ? (
                        <input
                            ref={customNodeNameInputRef}
                            type="text"
                            value={editingCustomNodeNameValue}
                            onChange={(e) => setEditingCustomNodeNameValue(e.target.value)}
                            onBlur={saveCustomNodeName}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') saveCustomNodeName()
                                if (e.key === 'Escape') setIsEditingCustomNodeName(false)
                            }}
                            className="w-full bg-black/30 border border-white/20 rounded px-2 py-1 text-sm text-white font-mono focus:border-cyan-500/50 focus:outline-none"
                            autoFocus
                        />
                    ) : (
                        <div
                            onClick={() => {
                                setEditingCustomNodeNameValue(selectedNode.name)
                                setIsEditingCustomNodeName(true)
                            }}
                            className="text-sm text-white/80 font-mono cursor-pointer hover:text-cyan-400 transition-colors px-2 py-1 rounded hover:bg-white/5"
                            title="Click to edit name"
                        >
                            {selectedNode.name}
                        </div>
                    )}
                </div>
            )}
        </>
    )
}
