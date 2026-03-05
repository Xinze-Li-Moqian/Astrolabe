export interface SelectedEdge {
    id: string
    source: string
    target: string
    sourceName: string
    targetName: string
    notes?: string
    style?: string
    effect?: string
    defaultStyle: string
    skippedNodes?: string[]
}
