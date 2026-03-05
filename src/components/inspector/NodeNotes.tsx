import MarkdownRenderer from '@/components/MarkdownRenderer'

export interface NodeNotesProps {
    editingNote: string
    notesExpanded: boolean
    setNotesExpanded: (v: boolean) => void
    codeViewerOpen: boolean
}

export function NodeNotes({ editingNote, notesExpanded, setNotesExpanded, codeViewerOpen }: NodeNotesProps) {
    if (!editingNote) return null

    return (
        <div className="mt-3 pt-3 border-t border-white/5">
            <div
                onClick={() => setNotesExpanded(!notesExpanded)}
                className={`cursor-pointer ${notesExpanded ? 'overflow-y-auto' : 'max-h-24 overflow-hidden'}`}
                style={notesExpanded ? { maxHeight: `calc(100vh - ${codeViewerOpen ? '400px' : '300px'})` } : {
                    maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                }}
            >
                <MarkdownRenderer content={editingNote} />
            </div>
        </div>
    )
}
