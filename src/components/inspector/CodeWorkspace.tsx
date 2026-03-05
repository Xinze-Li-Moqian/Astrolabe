import { Panel } from 'react-resizable-panels'
import { LeanCodePanel } from '@/components/LeanCodePanel'
import type { GraphNode } from '@/types/graph'
import type { FileContent } from '@/lib/api'
import type { CodeLocation } from '@/hooks/useCodeViewer'
import type { NodeStatusLine } from '@/lib/successLines'

export interface CodeWorkspaceProps {
    codeViewerOpen: boolean
    codeViewMode: 'code' | 'notes'
    setCodeViewMode: (mode: 'code' | 'notes') => void
    codeDirty: boolean
    setCodeViewerOpen: (v: boolean) => void
    codeLoading: boolean
    codeFile: FileContent | null
    codeLocation: CodeLocation | null
    selectedNode: GraphNode | null
    nodeClickCount: number
    nodeStatusLines: NodeStatusLine[]
    editingNote: string
    handleNoteChange: (v: string) => void
}

export function CodeWorkspace({
    codeViewerOpen, codeViewMode, setCodeViewMode, codeDirty,
    setCodeViewerOpen, codeLoading, codeFile, codeLocation,
    selectedNode, nodeClickCount, nodeStatusLines,
    editingNote, handleNoteChange,
}: CodeWorkspaceProps) {
    return (
        <>
                                    {codeViewerOpen && (
                                        <Panel defaultSize={35} minSize={20}>
                                            <div className="h-full flex flex-col bg-[#0d1117] border-l border-white/10">
                                                {/* Tab buttons */}
                                                <div className="flex border-b border-white/10 px-2 pt-2 gap-1">
                                                    <button
                                                        onClick={() => setCodeViewMode('code')}
                                                        className={`px-3 py-1.5 text-xs rounded-t transition-colors flex items-center gap-1 ${
                                                            codeViewMode === 'code'
                                                                ? 'bg-cyan-500/20 text-cyan-400 border-b-2 border-cyan-400'
                                                                : 'text-white/50 hover:text-white/80'
                                                        }`}
                                                    >
                                                        L∃∀N
                                                        {codeDirty && <span className="text-yellow-400" title="Unsaved changes (Ctrl+S to save)">●</span>}
                                                    </button>
                                                    <button
                                                        onClick={() => setCodeViewMode('notes')}
                                                        className={`px-3 py-1.5 text-xs rounded-t transition-colors ${
                                                            codeViewMode === 'notes'
                                                                ? 'bg-yellow-500/20 text-yellow-400 border-b-2 border-yellow-400'
                                                                : 'text-white/50 hover:text-white/80'
                                                        }`}
                                                        title="Edit Notes"
                                                    >
                                                        Notes
                                                    </button>
                                                    <div className="flex-1" />
                                                    <button
                                                        onClick={() => setCodeViewerOpen(false)}
                                                        className="px-2 py-1 text-white/40 hover:text-white/80 text-xs"
                                                        title="Close"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>

                                                {/* Content area */}
                                                <div className="flex-1 overflow-auto relative">
                                                    {/* Code panel - keep mounted, hide with CSS to avoid Monaco "Canceled" errors */}
                                                    <div className={`h-full ${codeViewMode === 'code' ? '' : 'hidden'}`}>
                                                        {codeLoading && (
                                                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                                                                <div className="text-white/40 text-sm">Loading...</div>
                                                            </div>
                                                        )}
                                                        {codeFile ? (
                                                            <LeanCodePanel
                                                                key={`${codeLocation?.filePath || selectedNode?.leanFilePath || 'editor'}-${codeLocation?.lineNumber || 0}-${nodeClickCount}`}
                                                                content={codeFile.content}
                                                                filePath={codeLocation?.filePath || selectedNode?.leanFilePath}
                                                                lineNumber={codeLocation?.lineNumber || selectedNode?.leanLineNumber}
                                                                startLine={codeFile.startLine}
                                                                endLine={codeFile.endLine}
                                                                totalLines={codeFile.totalLines}
                                                                nodeName={selectedNode?.name}
                                                                nodeKind={selectedNode?.id.startsWith('group:') ? 'namespace' : selectedNode?.type}
                                                                onClose={() => setCodeViewerOpen(false)}
                                                                hideHeader
                                                                readOnly
                                                                nodeStatusLines={nodeStatusLines}
                                                            />
                                                        ) : !codeLoading && (
                                                            <div className="h-full flex items-center justify-center">
                                                                <div className="text-white/40 text-sm">No content</div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Notes panel */}
                                                    <div className={`h-full flex flex-col ${codeViewMode === 'notes' ? '' : 'hidden'}`}>
                                                        <textarea
                                                            value={editingNote}
                                                            onChange={(e) => handleNoteChange(e.target.value)}
                                                            placeholder="# Notes&#10;&#10;Write your notes in **Markdown** format...&#10;&#10;- Supports lists&#10;- Code blocks&#10;- Math: $E = mc^2$&#10;&#10;Auto-saves as you type."
                                                            className="flex-1 w-full bg-transparent text-white/90 text-xs font-mono p-3 resize-none focus:outline-none placeholder-white/30 leading-relaxed"
                                                            spellCheck={false}
                                                        />
                                                        <div className="px-3 py-1.5 border-t border-white/10 text-[10px] text-white/30">
                                                            Markdown supported. Auto-saves as you type.
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </Panel>
                                    )}
        </>
    )
}
