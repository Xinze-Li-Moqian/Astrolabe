'use client'

import { ArrowPathIcon, TagIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'

export type CanvasToolbarProps = {
    canvasNodeCount: number
    totalNodeCount: number
    hideTechnical: boolean
    removedNodes: number
    orphanedNodes: number
    onBuildLsp: () => Promise<void> | void
    lspBuilding: boolean
    graphLoading: boolean
    namespaceCount: number
    onRefresh: () => Promise<void> | void
    showLabels: boolean
    onToggleLabels: () => void
    showBridges: boolean
    onToggleBridges: () => void
    bridgesAvailable: boolean
    onAddCustomNode: () => void
    isRemovingNodes: boolean
    onToggleRemoveMode: () => void
}

export function CanvasToolbar({
    canvasNodeCount,
    totalNodeCount,
    hideTechnical,
    removedNodes,
    orphanedNodes,
    onBuildLsp,
    lspBuilding,
    graphLoading,
    namespaceCount,
    onRefresh,
    showLabels,
    onToggleLabels,
    showBridges,
    onToggleBridges,
    bridgesAvailable,
    onAddCustomNode,
    isRemovingNodes,
    onToggleRemoveMode,
}: CanvasToolbarProps) {
    return (
        <div className="absolute top-3 left-3 z-10 flex gap-2">
            <div className="bg-black/60 px-3 py-1.5 rounded text-xs text-white/60 font-mono">
                <div>{canvasNodeCount} / {totalNodeCount} nodes</div>
                {hideTechnical && (removedNodes > 0 || orphanedNodes > 0) && (
                    <div className="text-yellow-400/60 text-[10px]" title={`${removedNodes} technical, ${orphanedNodes} orphaned`}>
                        ({removedNodes + orphanedNodes} hidden)
                    </div>
                )}
            </div>

            <button
                onClick={onRefresh}
                disabled={graphLoading}
                className="p-1.5 bg-black/60 hover:bg-white/20 rounded transition-colors disabled:opacity-50"
                title="Refresh project and canvas"
            >
                <ArrowPathIcon className={`w-4 h-4 text-white/60 ${graphLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
                onClick={onToggleLabels}
                className={`p-1.5 rounded transition-colors ${showLabels ? 'bg-green-500/30 text-green-400' : 'bg-black/60 text-white/40 hover:text-white'
                    }`}
                title={showLabels ? 'Hide Labels' : 'Show Labels'}
            >
                <TagIcon className="w-4 h-4" />
            </button>

            <button
                onClick={onToggleBridges}
                className={`p-1.5 rounded transition-colors ${showBridges ? 'bg-orange-500/30 text-orange-400' : 'bg-black/60 text-white/40 hover:text-white'
                    }`}
                title={showBridges ? 'Hide Bridges' : 'Show Bridges (critical edges)'}
                disabled={!bridgesAvailable}
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            </button>

            <button
                onClick={onAddCustomNode}
                className="p-1.5 bg-black/60 hover:bg-blue-500/30 text-white/60 hover:text-blue-400 rounded transition-colors"
                title="Add Custom Node"
            >
                <PlusIcon className="w-4 h-4" />
            </button>

            <button
                onClick={onToggleRemoveMode}
                className={`p-1.5 rounded transition-colors ${isRemovingNodes
                    ? 'bg-red-500/40 text-red-400 ring-1 ring-red-500/50'
                    : 'bg-black/60 text-white/60 hover:text-red-400 hover:bg-red-500/20'
                    }`}
                title={isRemovingNodes ? 'Exit Remove Mode (click empty area)' : 'Remove Nodes Mode'}
            >
                <TrashIcon className="w-4 h-4" />
            </button>
        </div>
    )
}
