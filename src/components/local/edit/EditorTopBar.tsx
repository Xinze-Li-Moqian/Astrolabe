// @ts-nocheck
import {
    HomeIcon,
    MagnifyingGlassIcon,
    CodeBracketIcon,
    CubeIcon,
} from '@heroicons/react/24/outline'
export function EditorTopBar({
    projectName,
    searchPanelOpen,
    infoPanelOpen,
    codeViewerOpen,
    onHome,
    onToggleSearchPanel,
    onToggleInfoPanel,
    onToggleCodeViewer,
}: any) {
    return (
        <div className="h-10 border-b border-white/10 bg-black/90 flex items-center justify-between px-3">
            <div className="flex items-center gap-2">
                <button
                    onClick={onHome}
                    className="p-1.5 hover:bg-white/10 rounded transition-colors"
                    title="Home"
                >
                    <HomeIcon className="w-4 h-4 text-white/60 hover:text-white" />
                </button>
                <span className="text-sm font-mono text-white/60 ml-2">{projectName}</span>
                <div className="w-px h-4 bg-white/20 ml-2" />
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={onToggleSearchPanel}
                    className={`p-1.5 rounded transition-colors ${
                        searchPanelOpen ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/40 hover:text-white'
                    }`}
                    title="Search Panel"
                >
                    <MagnifyingGlassIcon className="w-4 h-4" />
                </button>
                <button
                    onClick={onToggleInfoPanel}
                    className={`p-1.5 rounded transition-colors ${
                        infoPanelOpen ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/40 hover:text-white'
                    }`}
                    title="Node Info"
                >
                    <CubeIcon className="w-4 h-4" />
                </button>
                <button
                    onClick={onToggleCodeViewer}
                    className={`p-1.5 rounded transition-colors ${
                        codeViewerOpen ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-white/40 hover:text-white'
                    }`}
                    title="Code Viewer"
                >
                    <CodeBracketIcon className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}
