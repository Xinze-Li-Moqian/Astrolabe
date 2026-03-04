// @ts-nocheck
export function EditorStatusBar({ projectName, selectedNode, codeDirty }: any) {
    return (
        <div className="h-6 border-t border-white/10 bg-black flex items-center justify-between px-2 text-xs text-white/70 shrink-0">
            <div className="flex items-center gap-3">
                <span className="text-white/60">{projectName}</span>
            </div>

            <div className="flex items-center gap-3 text-white/60">
                {selectedNode?.leanFilePath && (
                    <span className="truncate max-w-[300px] flex items-center gap-1" title={selectedNode.leanFilePath}>
                        {selectedNode.leanFilePath.split('/').pop()}
                        {codeDirty && <span className="text-white/80" title="Unsaved changes (Ctrl+S to save)">&bull;</span>}
                    </span>
                )}
            </div>
        </div>
    )
}
