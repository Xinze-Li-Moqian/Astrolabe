import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { NodeInspector, type NodeInspectorProps } from '@/components/inspector/NodeInspector'
import { CodeWorkspace, type CodeWorkspaceProps } from '@/components/inspector/CodeWorkspace'

export interface InspectorPanelProps {
    rightPanelVisible: boolean
    infoPanelOpen: boolean
    isAddingEdge: boolean
    setIsAddingEdge: (v: boolean) => void
    inspector: NodeInspectorProps
    codeWorkspace: CodeWorkspaceProps
}

export function InspectorPanel({
    rightPanelVisible, infoPanelOpen, isAddingEdge, setIsAddingEdge,
    inspector, codeWorkspace,
}: InspectorPanelProps) {
    return (
        <>
            {rightPanelVisible && (
                <>
                    <PanelResizeHandle className="w-2 bg-white/10 hover:bg-blue-500/50 transition-colors cursor-col-resize flex items-center justify-center group">
                        <div className="h-12 w-1 bg-white/20 group-hover:bg-white/40 rounded-full" />
                    </PanelResizeHandle>
                    <Panel defaultSize={25} minSize={15} maxSize={40}>
                        <div className="h-full relative">
                            {isAddingEdge && (
                                <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center pointer-events-auto">
                                    <div className="text-center text-white/80 px-4">
                                        <div className="text-sm font-medium mb-2">Click a node on canvas</div>
                                        <button
                                            onClick={() => setIsAddingEdge(false)}
                                            className="text-xs text-white/50 hover:text-white/70 underline"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                            <PanelGroup direction="vertical" className="h-full">
                                {infoPanelOpen && (
                                    <Panel defaultSize={65} minSize={20}>
                                        <div className="h-full bg-black flex flex-col overflow-hidden border-l border-white/10">
                                            <NodeInspector {...inspector} />
                                        </div>
                                    </Panel>
                                )}

                                {infoPanelOpen && codeWorkspace.codeViewerOpen && (
                                    <PanelResizeHandle className="h-2 bg-white/10 hover:bg-blue-500/50 transition-colors cursor-row-resize flex items-center justify-center group">
                                        <div className="w-12 h-1 bg-white/20 group-hover:bg-white/40 rounded-full" />
                                    </PanelResizeHandle>
                                )}

                                <CodeWorkspace {...codeWorkspace} />
                            </PanelGroup>
                        </div>
                    </Panel>
                </>
            )}
        </>
    )
}
