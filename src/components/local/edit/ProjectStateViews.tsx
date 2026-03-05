// @ts-nocheck
import { HomeIcon } from '@heroicons/react/24/outline'
import { ProjectInitPanel } from '@/components/ProjectInitPanel'

export function TauriRequiredView() {
    return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="text-center">
                <h1 className="text-2xl font-mono text-white mb-4">Astrolabe</h1>
                <p className="text-white/60 text-sm">Please run this application in Tauri desktop mode</p>
            </div>
        </div>
    )
}

export function NoProjectSelectedView({ onHome }: any) {
    return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="text-center">
                <h1 className="text-2xl font-mono text-white mb-4">No Project Selected</h1>
                <button
                    onClick={onHome}
                    className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                    Go to Home
                </button>
            </div>
        </div>
    )
}

export function ProjectNotSupportedView({ projectName, message, onHome }: any) {
    return (
        <div className="h-screen flex flex-col bg-black text-white">
            <div className="h-10 border-b border-white/10 bg-black/90 flex items-center px-3">
                <button
                    onClick={onHome}
                    className="p-1.5 hover:bg-white/10 rounded transition-colors"
                    title="Home"
                >
                    <HomeIcon className="w-4 h-4 text-white/60 hover:text-white" />
                </button>
                <span className="text-sm font-mono text-white/60 ml-2">{projectName}</span>
            </div>
            <div className="flex-1 flex items-center justify-center">
                <div className="max-w-lg text-center p-8">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-yellow-500/20 flex items-center justify-center">
                        <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold mb-4">Project Not Supported</h2>
                    <p className="text-white/60 mb-6">{message}</p>
                    <p className="text-sm text-white/40 mb-8">
                        Astrolabe currently only supports Lean 4 + Lake projects. Please ensure the project root contains <code className="bg-white/10 px-1.5 py-0.5 rounded">lakefile.lean</code> or <code className="bg-white/10 px-1.5 py-0.5 rounded">lakefile.toml</code>.
                    </p>
                    <button
                        onClick={onHome}
                        className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        Back to Home
                    </button>
                </div>
            </div>
        </div>
    )
}

export function ProjectNeedsInitView({
    projectName,
    projectPath,
    projectStatus,
    onHome,
    onInitComplete,
}: any) {
    return (
        <div className="h-screen flex flex-col bg-black text-white">
            <div className="h-10 border-b border-white/10 bg-black/90 flex items-center px-3">
                <button
                    onClick={onHome}
                    className="p-1.5 hover:bg-white/10 rounded transition-colors"
                    title="Home"
                >
                    <HomeIcon className="w-4 h-4 text-white/60 hover:text-white" />
                </button>
                <span className="text-sm font-mono text-white/60 ml-2">{projectName}</span>
            </div>
            <ProjectInitPanel
                projectPath={projectPath}
                projectStatus={projectStatus}
                onInitComplete={onInitComplete}
            />
        </div>
    )
}
