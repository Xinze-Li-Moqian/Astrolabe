// @ts-nocheck
import { useState, useCallback } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { SortableSection } from '@/components/ui/SortableSection'
import { ChevronDownIcon, FunnelIcon, CubeTransparentIcon, BoltIcon, ChartBarIcon, InformationCircleIcon, WrenchScrewdriverIcon, XMarkIcon } from '@heroicons/react/24/outline'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { graphActions } from '@/lib/history/graphActions'
import { DEFAULT_PHYSICS } from '@/components/graph3d/ForceLayout'

    const statFormulaExplanations: Record<string, { title: string; content: string }> = {
        // Graph Statistics
        nodes: {
            title: 'Nodes (Vertices)',
            content: `**Formula:** $|V|$

**Definition:** The total number of nodes (vertices) in the dependency graph.

**Variables:**
- $V$ — The set of all nodes in the graph
- $|V|$ — The cardinality (count) of the node set

**Interpretation:** Each node represents a Lean declaration (theorem, definition, lemma, etc.). More nodes indicate a larger codebase.`
        },
        edges: {
            title: 'Edges (Dependencies)',
            content: `**Formula:** $|E|$

**Definition:** The total number of directed edges in the dependency graph.

**Variables:**
- $E$ — The set of all edges in the graph
- $|E|$ — The cardinality (count) of the edge set

**Interpretation:** Each edge represents a dependency relationship where one declaration uses another. More edges indicate more interconnected code.`
        },
        density: {
            title: 'Graph Density',
            content: `**Formula:** $$D = \\frac{|E|}{|V| \\cdot (|V| - 1)}$$

**Definition:** The ratio of actual edges to the maximum possible edges in a directed graph.

**Variables:**
- $D$ — Density value (0 to 1)
- $|E|$ — Number of edges
- $|V|$ — Number of nodes
- $|V| \\cdot (|V|-1)$ — Maximum possible edges in a directed graph

**Interpretation:**
- $D \\approx 0$ — Sparse graph (few dependencies)
- $D \\approx 1$ — Dense graph (many dependencies)
- Typical code graphs have very low density (< 1%)`
        },
        communities: {
            title: 'Communities (Louvain)',
            content: `**Algorithm:** Louvain Community Detection

**Definition:** Number of densely connected groups found by the Louvain algorithm.

**How it works:**
1. Initially, each node is its own community
2. Nodes are moved to neighboring communities if it increases modularity
3. Communities are aggregated and the process repeats
4. Stops when no move improves modularity

**Interpretation:** Communities often correspond to functional modules or related features in the codebase.`
        },
        modularity: {
            title: 'Modularity Q',
            content: `**Formula:** $$Q = \\frac{1}{2m} \\sum_{ij} \\left[ A_{ij} - \\frac{k_i k_j}{2m} \\right] \\delta(c_i, c_j)$$

**Definition:** Measures the strength of division into communities.

**Variables:**
- $Q$ — Modularity score (-0.5 to 1)
- $m$ — Total number of edges ($|E|$)
- $A_{ij}$ — Adjacency matrix entry (1 if edge exists, 0 otherwise)
- $k_i, k_j$ — Degree of nodes $i$ and $j$
- $\\frac{k_i k_j}{2m}$ — Expected edges under null model
- $\\delta(c_i, c_j)$ — 1 if nodes $i,j$ are in same community, 0 otherwise

**Interpretation:**
- $Q > 0.3$ — Significant community structure
- $Q > 0.7$ — Strong community structure
- Higher Q means clearer separation between modules`
        },
        bridges: {
            title: 'Bridge Edges',
            content: `**Definition:** Edges whose removal would disconnect the graph (increase the number of connected components).

**Algorithm:** Tarjan's bridge-finding algorithm using DFS.

**Variables:**
- Bridge edge $(u, v)$ — An edge where removing it disconnects $u$ from $v$

**Interpretation:** Bridge edges represent critical dependencies. If a bridge edge is broken (e.g., by refactoring), parts of the codebase become unreachable from each other.`
        },
        vnEntropy: {
            title: 'Von Neumann Entropy',
            content: `**Formula:** $$S_{VN} = -\\text{tr}(\\rho \\log_2 \\rho) = -\\sum_i \\lambda_i \\log_2 \\lambda_i$$

**Definition:** Quantum-inspired entropy measuring graph structural complexity.

**Variables:**
- $S_{VN}$ — Von Neumann entropy (≥ 0)
- $\\rho$ — Density matrix: $\\rho = \\frac{L}{\\text{tr}(L)}$
- $L$ — Normalized Laplacian matrix
- $\\lambda_i$ — Eigenvalues of $\\rho$
- $\\text{tr}$ — Matrix trace (sum of diagonal)

**Interpretation:**
- Low entropy — Simple, regular structure
- High entropy — Complex, irregular structure
- Useful for comparing structural complexity across graphs`
        },
        shannon: {
            title: 'Degree Shannon Entropy',
            content: `**Formula:** $$H = -\\sum_{k} p_k \\log_2 p_k$$

**Definition:** Shannon entropy of the degree distribution.

**Variables:**
- $H$ — Shannon entropy (≥ 0)
- $k$ — A specific degree value
- $p_k$ — Fraction of nodes with degree $k$: $p_k = \\frac{n_k}{|V|}$
- $n_k$ — Number of nodes with degree $k$

**Interpretation:**
- Low entropy — Homogeneous degrees (all nodes similar)
- High entropy — Heterogeneous degrees (varied connectivity)
- Scale-free networks typically have high degree entropy`
        },
        structEntropy: {
            title: 'Structure Entropy',
            content: `**Formula:** $$H^{\\mathcal{T}} = -\\sum_{i=1}^{n} \\frac{d_i}{2m} \\log_2 \\frac{V_i}{V_{\\pi(i)}}$$

**Definition:** Measures structural complexity via hierarchical community encoding.

**Variables:**
- $H^{\\mathcal{T}}$ — Structure entropy
- $d_i$ — Degree of node $i$
- $m$ — Total number of edges
- $V_i$ — Volume of node $i$'s community
- $V_{\\pi(i)}$ — Volume of parent community in hierarchy
- $\\pi(i)$ — Parent of node $i$ in encoding tree

**Interpretation:** Lower structure entropy indicates more compressible/organized structure. Used to find optimal community hierarchies.`
        },
        // Lean Statistics
        depth: {
            title: 'Proof Depth (DAG Height)',
            content: `**Formula:** $$\\text{depth}(v) = \\begin{cases} 0 & \\text{if } \\text{indeg}(v) = 0 \\\\ \\max_{u \\in \\text{deps}(v)} \\text{depth}(u) + 1 & \\text{otherwise} \\end{cases}$$

**Definition:** The longest path from any source node to any sink node in the DAG.

**Variables:**
- $\\text{depth}(v)$ — Depth of node $v$
- $\\text{indeg}(v)$ — In-degree (number of dependencies)
- $\\text{deps}(v)$ — Set of nodes that $v$ depends on

**Interpretation:** Proof depth indicates the maximum "layers" of abstraction. Deep proofs rely on long chains of lemmas.`
        },
        layers: {
            title: 'Topological Layers',
            content: `**Formula:** $$\\text{layers} = \\max_{v \\in V} \\text{depth}(v) + 1$$

**Definition:** Number of distinct depth levels in the DAG.

**Variables:**
- $V$ — Set of all nodes
- $\\text{depth}(v)$ — Depth of node $v$ (0-indexed)

**Interpretation:** Layer 0 contains axioms/definitions with no dependencies. Each subsequent layer builds on previous layers.`
        },
        sources: {
            title: 'Source Nodes (Axioms/Definitions)',
            content: `**Formula:** $$\\text{Sources} = \\{ v \\in V : \\text{indeg}(v) = 0 \\}$$

**Definition:** Nodes with no incoming edges (no dependencies).

**Variables:**
- $V$ — Set of all nodes
- $\\text{indeg}(v)$ — In-degree of node $v$ (number of edges pointing to $v$)

**Interpretation:** Source nodes are the "foundation" — axioms, primitive definitions, and external imports that don't depend on anything in the current scope.`
        },
        sinks: {
            title: 'Sink Nodes (Terminals)',
            content: `**Formula:** $$\\text{Sinks} = \\{ v \\in V : \\text{outdeg}(v) = 0 \\}$$

**Definition:** Nodes with no outgoing edges (not used by other declarations).

**Variables:**
- $V$ — Set of all nodes
- $\\text{outdeg}(v)$ — Out-degree of node $v$ (number of edges from $v$)

**Interpretation:** Sink nodes are "endpoints" — final theorems, user-facing APIs, or unused code. They represent the ultimate goals or potentially dead code.`
        },
        criticalPath: {
            title: 'Critical Path (Longest Chain)',
            content: `**Algorithm:** Longest path in a DAG via dynamic programming.

**Definition:** The longest dependency chain from any source to any sink.

**How it works:**
1. Topologically sort all nodes
2. For each node, compute longest path ending at that node
3. Track the predecessor to reconstruct the path
4. Return the path with maximum length

**Interpretation:** The critical path shows the deepest dependency chain. Theorems on this path form the "backbone" of the proof structure.`
        }
    }

export function SettingsPanel(props: any) {
    const {
        viewMode,
        filterOptions,
        updateFilterOptionsUndoable,
        physics,
        updatePhysicsUndoable,
        analysisData,
        analysisLoading,
        sizeMappingMode,
        setSizeMappingMode,
        sizeCurveControl,
        setSizeCurveControl,
        colorMappingMode,
        setColorMappingMode,
        layoutClusterMode,
        setLayoutClusterMode,
        namespaceDepthPreview,
        namespaceData,
        namespacesOnCanvas,
        handleNamespaceClick,
        astrolabeNodes,
        handleClearCanvas,
        handleResetAllData,
        canvasNodes,
        visibleNodes,
    } = props

    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['graphSimplification', 'layoutOptimization', 'physics', 'analysis', 'actions']))
    const [expandedInfoTips, setExpandedInfoTips] = useState<Set<string>>(new Set())
    const [activeStatFormula, setActiveStatFormula] = useState<string | null>(null)

    const toggleSection = useCallback((section: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev)
            next.has(section) ? next.delete(section) : next.add(section)
            return next
        })
    }, [])

    const defaultSectionOrder = ['graphSimplification', 'layoutOptimization', 'physics', 'analysis', 'actions']
    const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('astrolabe-section-order')
            if (saved) {
                try {
                    const parsed = JSON.parse(saved)
                    const merged = [...parsed.filter((s: string) => defaultSectionOrder.includes(s))]
                    for (const s of defaultSectionOrder) {
                        if (!merged.includes(s)) {
                            merged.push(s)
                        }
                    }
                    return merged
                } catch {
                }
            }
        }
        return defaultSectionOrder
    })

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event
        if (over && active.id !== over.id) {
            setSectionOrder(prev => {
                const oldIndex = prev.indexOf(active.id as string)
                const newIndex = prev.indexOf(over.id as string)
                const newOrder = arrayMove(prev, oldIndex, newIndex)
                localStorage.setItem('astrolabe-section-order', JSON.stringify(newOrder))
                return newOrder
            })
        }
    }, [])

    return (
        <>
                                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                            <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
                                            <div className="h-full overflow-y-auto p-3 flex flex-col gap-4">
                                                {/* === GRAPH SIMPLIFICATION === */}
                                                <SortableSection id="graphSimplification" order={sectionOrder.indexOf('graphSimplification')}>
                                                <div className="border-t border-white/10 pt-3">
                                                    <div className="pr-5">
                                                        <button
                                                            onClick={() => toggleSection('graphSimplification')}
                                                            className="w-full flex items-center gap-2 py-1.5 text-white/60 hover:text-white/80 transition-colors group"
                                                        >
                                                            <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${collapsedSections.has('graphSimplification') ? '-rotate-90' : ''}`} />
                                                            <FunnelIcon className="w-4 h-4" />
                                                            <span className="text-[10px] uppercase tracking-wider font-medium">Graph Simplification</span>
                                                        </button>
                                                    </div>
                                                    {!collapsedSections.has('graphSimplification') && (
                                                    <div className="space-y-2 ml-5 mt-1">
                                                        {/* Hide Technical */}
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={filterOptions.hideTechnical}
                                                                    onChange={(e) => updateFilterOptionsUndoable({ ...filterOptions, hideTechnical: e.target.checked })}
                                                                    className="rounded bg-white/20 border-white/30 text-white/80 focus:ring-white/40"
                                                                />
                                                                <span className="text-xs text-white/80">Hide Technical</span>
                                                                <button
                                                                    onClick={() => setExpandedInfoTips(prev => {
                                                                        const next = new Set(prev)
                                                                        next.has('hideTechnical') ? next.delete('hideTechnical') : next.add('hideTechnical')
                                                                        return next
                                                                    })}
                                                                    className="ml-auto text-white/30 hover:text-white/60"
                                                                >
                                                                    <InformationCircleIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {/* Transitive Reduction */}
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={filterOptions.transitiveReduction ?? true}
                                                                    onChange={(e) => updateFilterOptionsUndoable({ ...filterOptions, transitiveReduction: e.target.checked })}
                                                                    className="rounded bg-white/20 border-white/30 text-white/80 focus:ring-white/40"
                                                                />
                                                                <span className="text-xs text-white/80">Transitive Reduction</span>
                                                                <button
                                                                    onClick={() => setExpandedInfoTips(prev => {
                                                                        const next = new Set(prev)
                                                                        next.has('transitiveReduction') ? next.delete('transitiveReduction') : next.add('transitiveReduction')
                                                                        return next
                                                                    })}
                                                                    className="ml-auto text-white/30 hover:text-white/60"
                                                                >
                                                                    <InformationCircleIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {/* Hide Orphaned */}
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={filterOptions.hideOrphaned ?? false}
                                                                    onChange={(e) => updateFilterOptionsUndoable({ ...filterOptions, hideOrphaned: e.target.checked })}
                                                                    className="rounded bg-white/20 border-white/30 text-white/80 focus:ring-white/40"
                                                                />
                                                                <span className="text-xs text-white/80">Hide Orphaned</span>
                                                                <button
                                                                    onClick={() => setExpandedInfoTips(prev => {
                                                                        const next = new Set(prev)
                                                                        next.has('hideOrphaned') ? next.delete('hideOrphaned') : next.add('hideOrphaned')
                                                                        return next
                                                                    })}
                                                                    className="ml-auto text-white/30 hover:text-white/60"
                                                                >
                                                                    <InformationCircleIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    )}
                                                </div>
                                                </SortableSection>

                                                {/* === LAYOUT OPTIMIZATION === */}
                                                <SortableSection id="layoutOptimization" disabled={viewMode !== '3d'} order={sectionOrder.indexOf('layoutOptimization')}>
                                                {viewMode === '3d' && (
                                                    <div className="border-t border-white/10 pt-3">
                                                        <div className="flex items-center gap-1 pr-5">
                                                            <button
                                                                onClick={() => toggleSection('layoutOptimization')}
                                                                className="flex items-center gap-2 py-1.5 text-white/60 hover:text-white/80 transition-colors group"
                                                            >
                                                                <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${collapsedSections.has('layoutOptimization') ? '-rotate-90' : ''}`} />
                                                                <CubeTransparentIcon className="w-4 h-4" />
                                                                <span className="text-[10px] uppercase tracking-wider font-medium">Layout Optimization</span>
                                                            </button>
                                                            <button
                                                                onClick={() => setExpandedInfoTips(prev => {
                                                                    const next = new Set(prev)
                                                                    next.has('layoutOptimization') ? next.delete('layoutOptimization') : next.add('layoutOptimization')
                                                                    return next
                                                                })}
                                                                className="text-white/30 hover:text-white/60"
                                                            >
                                                                <InformationCircleIcon className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        {!collapsedSections.has('layoutOptimization') && (
                                                        <div className="ml-5 mt-1">
                                                        {/* Clustering (collapsible) */}
                                                        <div className="mb-3">
                                                            <button
                                                                onClick={() => toggleSection('clustering')}
                                                                className="flex items-center gap-2 py-1 text-white/60 hover:text-white/80 transition-colors"
                                                            >
                                                                <ChevronDownIcon className={`w-3 h-3 transition-transform ${collapsedSections.has('clustering') ? '-rotate-90' : ''}`} />
                                                                <span className="text-xs font-medium text-white/80">Clustering</span>
                                                            </button>
                                                            {!collapsedSections.has('clustering') && (
                                                            <div className="ml-5 mt-1 space-y-1.5">
                                                                {([
                                                                    { mode: 'namespace' as const, label: 'Namespace', available: true },
                                                                    { mode: 'community' as const, label: 'Community', available: !!analysisData.communities },
                                                                    { mode: 'layer' as const, label: 'Layer', available: !!analysisData.layers },
                                                                    { mode: 'spectral' as const, label: 'Spectral', available: !!analysisData.spectralClusters },
                                                                    { mode: 'embedding' as const, label: 'Embedding', available: !!analysisData.embeddingClusters },
                                                                    { mode: 'curvature' as const, label: 'Curvature', available: !!analysisData.curvature },
                                                                    { mode: 'anomaly' as const, label: 'Anomaly', available: !!analysisData.anomalies },
                                                                    { mode: 'motif' as const, label: 'Motif', available: !!analysisData.dominantMotif },
                                                                ]).map(({ mode, label, available }) => (
                                                                    <label key={mode} className={`flex items-center gap-2 cursor-pointer ${!available ? 'opacity-30 pointer-events-none' : ''}`}>
                                                                        <input
                                                                            type="radio"
                                                                            name="clusterMode"
                                                                            checked={layoutClusterMode === mode}
                                                                            disabled={!available}
                                                                            onChange={() => {
                                                                                if (layoutClusterMode === mode) {
                                                                                    setLayoutClusterMode('none')
                                                                                    updatePhysicsUndoable({ ...physics, clusteringEnabled: false, communityAwareLayout: false })
                                                                                } else {
                                                                                    setLayoutClusterMode(mode)
                                                                                    updatePhysicsUndoable({
                                                                                        ...physics,
                                                                                        clusteringEnabled: mode === 'namespace',
                                                                                        communityAwareLayout: mode !== 'namespace' && mode !== 'none',
                                                                                    })
                                                                                }
                                                                            }}
                                                                            className="bg-white/20 border-white/30 text-white/80 focus:ring-white/40"
                                                                        />
                                                                        <span className="text-xs text-white/80">{label}</span>
                                                                    </label>
                                                                ))}
                                                                {layoutClusterMode !== 'none' && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setLayoutClusterMode('none')
                                                                            updatePhysicsUndoable({ ...physics, clusteringEnabled: false, communityAwareLayout: false })
                                                                        }}
                                                                        className="text-[9px] text-white/40 hover:text-white/60 ml-5"
                                                                    >
                                                                        Clear selection
                                                                    </button>
                                                                )}
                                                                {layoutClusterMode !== 'none' && (
                                                                    <div className="mt-2">
                                                                        <input
                                                                            type="range"
                                                                            min="0"
                                                                            max="10"
                                                                            step="0.5"
                                                                            value={10 - (layoutClusterMode === 'namespace' ? physics.clusteringStrength : (physics.communityClusteringStrength ?? 2.0))}
                                                                            onChange={(e) => {
                                                                                const intensity = 10 - parseFloat(e.target.value)
                                                                                if (layoutClusterMode === 'namespace') {
                                                                                    updatePhysicsUndoable({ ...physics, clusteringStrength: intensity, clusterSeparation: intensity * 1.5 })
                                                                                } else {
                                                                                    updatePhysicsUndoable({ ...physics, communityClusteringStrength: intensity, communitySeparation: intensity * 1.5 + 0.5 })
                                                                                }
                                                                            }}
                                                                            className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                        />
                                                                        <div className="flex justify-between text-[9px] text-white/30 mt-1">
                                                                            <span>Clustered</span>
                                                                            <span>Loose</span>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            )}
                                                        </div>


                                                        {/* Adaptive Springs */}
                                                        <div className="mt-3">
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={physics.adaptiveSpringEnabled}
                                                                    onChange={(e) => updatePhysicsUndoable({ ...physics, adaptiveSpringEnabled: e.target.checked })}
                                                                    className="rounded bg-white/20 border-white/30 text-white/80 focus:ring-white/40"
                                                                />
                                                                <span className="text-xs text-white/80">Adaptive Springs</span>
                                                                <button
                                                                    onClick={() => setExpandedInfoTips(prev => {
                                                                        const next = new Set(prev)
                                                                        next.has('adaptiveSprings') ? next.delete('adaptiveSprings') : next.add('adaptiveSprings')
                                                                        return next
                                                                    })}
                                                                    className="ml-auto text-white/30 hover:text-white/60"
                                                                >
                                                                    <InformationCircleIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                            {physics.adaptiveSpringEnabled && (
                                                                <div className="mt-2 ml-5 space-y-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] text-white/40 w-14">Mode</span>
                                                                        <select
                                                                            value={physics.adaptiveSpringMode}
                                                                            onChange={(e) => updatePhysicsUndoable({ ...physics, adaptiveSpringMode: e.target.value as 'sqrt' | 'logarithmic' | 'linear' })}
                                                                            className="flex-1 text-[10px] bg-white/10 border border-white/20 rounded px-2 py-0.5 text-white/80"
                                                                        >
                                                                            <option value="sqrt">Square Root</option>
                                                                            <option value="logarithmic">Logarithmic</option>
                                                                            <option value="linear">Linear</option>
                                                                        </select>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] text-white/40 w-14">Scale</span>
                                                                        <input
                                                                            type="range"
                                                                            min="0"
                                                                            max="10"
                                                                            step="0.5"
                                                                            value={physics.adaptiveSpringScale}
                                                                            onChange={(e) => updatePhysicsUndoable({ ...physics, adaptiveSpringScale: Number(e.target.value) })}
                                                                            className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                        />
                                                                        <span className="text-[10px] text-white/60 w-6 text-right">{physics.adaptiveSpringScale.toFixed(1)}</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                        </div>
                                                        )}
                                                    </div>
                                                )}
                                                </SortableSection>

                                                {/* === PHYSICS === */}
                                                <SortableSection id="physics" disabled={viewMode !== '3d'} order={sectionOrder.indexOf('physics')}>
                                                {viewMode === '3d' && (
                                                    <div className="border-t border-white/10 pt-3">
                                                        <div className="flex items-center gap-1 pr-5">
                                                            <button
                                                                onClick={() => toggleSection('physics')}
                                                                className="flex items-center gap-2 py-1.5 text-white/60 hover:text-white/80 transition-colors group"
                                                            >
                                                                <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${collapsedSections.has('physics') ? '-rotate-90' : ''}`} />
                                                                <BoltIcon className="w-4 h-4" />
                                                                <span className="text-[10px] uppercase tracking-wider font-medium">Physics</span>
                                                            </button>
                                                            <button
                                                                onClick={() => setExpandedInfoTips(prev => {
                                                                    const next = new Set(prev)
                                                                    next.has('physics') ? next.delete('physics') : next.add('physics')
                                                                    return next
                                                                })}
                                                                className="text-white/30 hover:text-white/60"
                                                            >
                                                                <InformationCircleIcon className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        {!collapsedSections.has('physics') && (
                                                        <div className="space-y-1.5 ml-5 mt-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-white/50 w-20">Repulsion</span>
                                                                <input
                                                                    type="range"
                                                                    min="10"
                                                                    max="500"
                                                                    step="10"
                                                                    value={physics.repulsionStrength}
                                                                    onChange={(e) => updatePhysicsUndoable({ ...physics, repulsionStrength: Number(e.target.value) })}
                                                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                />
                                                                <span className="text-[10px] text-white/60 w-8 text-right">{physics.repulsionStrength}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-white/50 w-20">Edge Length</span>
                                                                <input
                                                                    type="range"
                                                                    min="1"
                                                                    max="20"
                                                                    step="0.5"
                                                                    value={physics.springLength}
                                                                    onChange={(e) => updatePhysicsUndoable({ ...physics, springLength: Number(e.target.value) })}
                                                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                />
                                                                <span className="text-[10px] text-white/60 w-8 text-right">{physics.springLength}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-white/50 w-20">Edge Tension</span>
                                                                <input
                                                                    type="range"
                                                                    min="0.1"
                                                                    max="10"
                                                                    step="0.1"
                                                                    value={physics.springStrength}
                                                                    onChange={(e) => updatePhysicsUndoable({ ...physics, springStrength: Number(e.target.value) })}
                                                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                />
                                                                <span className="text-[10px] text-white/60 w-8 text-right">{physics.springStrength.toFixed(1)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-white/50 w-20">Gravity</span>
                                                                <input
                                                                    type="range"
                                                                    min="0"
                                                                    max="5"
                                                                    step="0.1"
                                                                    value={physics.centerStrength}
                                                                    onChange={(e) => updatePhysicsUndoable({ ...physics, centerStrength: Number(e.target.value) })}
                                                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                />
                                                                <span className="text-[10px] text-white/60 w-8 text-right">{physics.centerStrength.toFixed(1)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-white/50 w-20">Damping</span>
                                                                <input
                                                                    type="range"
                                                                    min="0.3"
                                                                    max="0.95"
                                                                    step="0.05"
                                                                    value={physics.damping}
                                                                    onChange={(e) => updatePhysicsUndoable({ ...physics, damping: Number(e.target.value) })}
                                                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                />
                                                                <span className="text-[10px] text-white/60 w-8 text-right">{physics.damping.toFixed(2)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-white/50 w-20">Boundary</span>
                                                                <input
                                                                    type="range"
                                                                    min="5"
                                                                    max="200"
                                                                    step="5"
                                                                    value={physics.boundaryRadius ?? 100}
                                                                    onChange={(e) => updatePhysicsUndoable({ ...physics, boundaryRadius: Number(e.target.value) })}
                                                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                />
                                                                <span className="text-[10px] text-white/60 w-8 text-right">{physics.boundaryRadius ?? 100}</span>
                                                            </div>
                                                        </div>
                                                        )}
                                                    </div>
                                                )}
                                                </SortableSection>

                                                {/* === ANALYSIS === */}
                                                <SortableSection id="analysis" order={sectionOrder.indexOf('analysis')}>
                                                <div className="border-t border-white/10 pt-3">
                                                    <div className="flex items-center gap-1 pr-5">
                                                        <button
                                                            onClick={() => toggleSection('analysis')}
                                                            className="flex items-center gap-2 py-1.5 text-white/60 hover:text-white/80 transition-colors group"
                                                        >
                                                            <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${collapsedSections.has('analysis') ? '-rotate-90' : ''}`} />
                                                            <ChartBarIcon className="w-4 h-4" />
                                                            <span className="text-[10px] uppercase tracking-wider font-medium">Network Analysis</span>
                                                            {analysisLoading && (
                                                                <div className="w-3 h-3 border-2 border-purple-300/30 border-t-purple-300 rounded-full animate-spin" />
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => setExpandedInfoTips(prev => {
                                                                const next = new Set(prev)
                                                                next.has('analysisStats') ? next.delete('analysisStats') : next.add('analysisStats')
                                                                return next
                                                            })}
                                                            className="text-white/30 hover:text-white/60"
                                                        >
                                                            <InformationCircleIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                    {/* Centered Modal Info */}
                                                    {expandedInfoTips.has('analysisStats') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => {
                                                                const next = new Set(prev)
                                                                next.delete('analysisStats')
                                                                return next
                                                            })}
                                                        >
                                                            <div
                                                                className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-xl w-full mx-4 max-h-[80vh] overflow-y-auto"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <h2 className="text-lg text-white font-medium mb-3">Network Analysis</h2>
                                                                <p className="text-sm text-white/60 mb-4">
                                                                    Analyze the dependency graph using graph theory and topological methods.
                                                                </p>

                                                                <div className="space-y-4 text-sm">
                                                                    <div className="bg-white/5 rounded-lg p-3">
                                                                        <div className="font-medium text-white mb-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-400 inline-block" /> Size Mapping</div>
                                                                        <div className="text-white/60">Map node importance metrics to visual size. Options include PageRank, betweenness centrality, dependency depth, Katz centrality, HITS scores, and more. Click the ⓘ next to Size Mapping for detailed formulas.</div>
                                                                    </div>

                                                                    <div className="bg-white/5 rounded-lg p-3">
                                                                        <div className="font-medium text-white mb-2 flex items-center gap-2"><span className="w-3 h-3 rounded-sm inline-block" style={{background: 'linear-gradient(135deg, #f43f5e, #8b5cf6, #3b82f6)'}} /> Color Mapping</div>
                                                                        <div className="text-white/60">Color nodes by community structure, type, or geometric properties. Options include Louvain communities, spectral clustering, Ricci curvature, motif patterns, and more. Click the ⓘ next to Color Mapping for details.</div>
                                                                    </div>

                                                                    <div className="bg-white/5 rounded-lg p-3">
                                                                        <div className="font-medium text-white mb-2 flex items-center gap-2"><span className="text-purple-400">⊞</span> Layout Clustering</div>
                                                                        <div className="text-white/60">Group related nodes spatially using community detection, namespace hierarchy, spectral embedding, curvature grouping, or motif patterns.</div>
                                                                    </div>

                                                                    <div className="bg-white/5 rounded-lg p-3">
                                                                        <div className="font-medium text-white mb-2 flex items-center gap-2"><span className="text-cyan-400">∑</span> Advanced Analysis</div>
                                                                        <div className="text-white/60">Persistence diagrams (topological features), Mapper graphs (shape skeleton), and metric correlation heatmaps are available below in this panel.</div>
                                                                    </div>

                                                                    <div className="bg-white/5 rounded-lg p-3">
                                                                        <div className="font-medium text-white mb-2 flex items-center gap-2"><span className="text-orange-400">⟷</span> Edge Features</div>
                                                                        <div className="text-white/60">Show Bridges highlights critical edges. Highlight Path to Selected shows the dependency chain to a selected node.</div>
                                                                    </div>
                                                                </div>
                                                                {/* Graph Statistics */}
                                                                {(analysisData.density !== undefined || analysisData.vonNeumannEntropy !== undefined) && (
                                                                    <div className="mt-4 pt-4 border-t border-white/10">
                                                                        <h3 className="text-sm font-medium text-white/80 mb-2">Graph Statistics <span className="text-white/40 text-xs font-normal">(click for formula)</span></h3>
                                                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                                                            {analysisData.nodeCount !== undefined && (
                                                                                <div className="bg-white/5 rounded px-3 py-2 cursor-pointer hover:bg-white/10" onClick={() => setActiveStatFormula('nodes')}>
                                                                                    <div className="text-white/40 text-xs">Nodes</div>
                                                                                    <div className="text-white font-medium">{analysisData.nodeCount.toLocaleString()}</div>
                                                                                </div>
                                                                            )}
                                                                            {analysisData.edgeCount !== undefined && (
                                                                                <div className="bg-white/5 rounded px-3 py-2 cursor-pointer hover:bg-white/10" onClick={() => setActiveStatFormula('edges')}>
                                                                                    <div className="text-white/40 text-xs">Edges</div>
                                                                                    <div className="text-white font-medium">{analysisData.edgeCount.toLocaleString()}</div>
                                                                                </div>
                                                                            )}
                                                                            {analysisData.density !== undefined && (
                                                                                <div className="bg-white/5 rounded px-3 py-2 cursor-pointer hover:bg-white/10" onClick={() => setActiveStatFormula('density')}>
                                                                                    <div className="text-white/40 text-xs">Density</div>
                                                                                    <div className="text-white font-medium">{(analysisData.density * 100).toFixed(4)}%</div>
                                                                                </div>
                                                                            )}
                                                                            {analysisData.communityCount !== undefined && (
                                                                                <div className="bg-white/5 rounded px-3 py-2 cursor-pointer hover:bg-white/10" onClick={() => setActiveStatFormula('communities')}>
                                                                                    <div className="text-white/40 text-xs">Communities</div>
                                                                                    <div className="text-white font-medium">{analysisData.communityCount}</div>
                                                                                </div>
                                                                            )}
                                                                            {analysisData.modularity !== undefined && (
                                                                                <div className="bg-white/5 rounded px-3 py-2 cursor-pointer hover:bg-white/10" onClick={() => setActiveStatFormula('modularity')}>
                                                                                    <div className="text-white/40 text-xs">Modularity Q</div>
                                                                                    <div className="text-white font-medium">{analysisData.modularity.toFixed(4)}</div>
                                                                                </div>
                                                                            )}
                                                                            {analysisData.bridges && analysisData.bridges.length > 0 && (
                                                                                <div className="bg-white/5 rounded px-3 py-2 cursor-pointer hover:bg-white/10" onClick={() => setActiveStatFormula('bridges')}>
                                                                                    <div className="text-white/40 text-xs">Bridges</div>
                                                                                    <div className="text-white font-medium">{analysisData.bridges.length}</div>
                                                                                </div>
                                                                            )}
                                                                            {analysisData.vonNeumannEntropy !== undefined && (
                                                                                <div className="bg-white/5 rounded px-3 py-2 cursor-pointer hover:bg-white/10" onClick={() => setActiveStatFormula('vnEntropy')}>
                                                                                    <div className="text-white/40 text-xs">Von Neumann Entropy</div>
                                                                                    <div className="text-white font-medium">{analysisData.vonNeumannEntropy.toFixed(4)}</div>
                                                                                </div>
                                                                            )}
                                                                            {analysisData.degreeShannon !== undefined && (
                                                                                <div className="bg-white/5 rounded px-3 py-2 cursor-pointer hover:bg-white/10" onClick={() => setActiveStatFormula('shannon')}>
                                                                                    <div className="text-white/40 text-xs">Degree Shannon</div>
                                                                                    <div className="text-white font-medium">{analysisData.degreeShannon.toFixed(4)}</div>
                                                                                </div>
                                                                            )}
                                                                            {analysisData.structureEntropy !== undefined && (
                                                                                <div className="bg-white/5 rounded px-3 py-2 cursor-pointer hover:bg-white/10" onClick={() => setActiveStatFormula('structEntropy')}>
                                                                                    <div className="text-white/40 text-xs">Structure Entropy</div>
                                                                                    <div className="text-white font-medium">{analysisData.structureEntropy.toFixed(4)}</div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {/* Lean Statistics (DAG + Declaration Kinds) */}
                                                                {(analysisData.graphDepth !== undefined || (analysisData.kindDistribution && Object.keys(analysisData.kindDistribution).length > 0)) && (
                                                                    <div className="mt-4 pt-4 border-t border-white/10">
                                                                        <h3 className="text-sm font-medium text-white/80 mb-2">Lean Statistics <span className="text-white/40 text-xs font-normal">(click for formula)</span></h3>
                                                                        {/* DAG metrics */}
                                                                        {analysisData.graphDepth !== undefined && (
                                                                            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                                                                                <div className="bg-white/5 rounded px-3 py-2 cursor-pointer hover:bg-white/10" onClick={() => setActiveStatFormula('depth')}>
                                                                                    <div className="text-white/40 text-xs">Proof Depth</div>
                                                                                    <div className="text-white font-medium">{analysisData.graphDepth}</div>
                                                                                </div>
                                                                                <div className="bg-white/5 rounded px-3 py-2 cursor-pointer hover:bg-white/10" onClick={() => setActiveStatFormula('layers')}>
                                                                                    <div className="text-white/40 text-xs">Layers</div>
                                                                                    <div className="text-white font-medium">{analysisData.numLayers}</div>
                                                                                </div>
                                                                                <div className="bg-white/5 rounded px-3 py-2 cursor-pointer hover:bg-white/10" onClick={() => setActiveStatFormula('sources')}>
                                                                                    <div className="text-white/40 text-xs">Axioms/Defs</div>
                                                                                    <div className="text-white font-medium">{analysisData.sources?.length ?? 0}</div>
                                                                                </div>
                                                                                <div className="bg-white/5 rounded px-3 py-2 cursor-pointer hover:bg-white/10" onClick={() => setActiveStatFormula('sinks')}>
                                                                                    <div className="text-white/40 text-xs">Terminals</div>
                                                                                    <div className="text-white font-medium">{analysisData.sinks?.length ?? 0}</div>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        {analysisData.criticalPath && analysisData.criticalPath.length > 0 && (
                                                                            <div className="mb-3 bg-white/5 rounded px-3 py-2 cursor-pointer hover:bg-white/10" onClick={() => setActiveStatFormula('criticalPath')}>
                                                                                <div className="text-white/40 text-xs">Longest Chain ({analysisData.criticalPath.length} nodes)</div>
                                                                                <div className="text-white/60 text-xs font-mono overflow-x-auto whitespace-nowrap pb-1">
                                                                                    {analysisData.criticalPath.join(' → ')}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        {/* Declaration Kinds */}
                                                                        {analysisData.kindDistribution && Object.keys(analysisData.kindDistribution).length > 0 && (
                                                                            <div>
                                                                                <div className="text-white/40 text-xs mb-2">Declaration Kinds</div>
                                                                                <div className="space-y-1">
                                                                                    {Object.entries(analysisData.kindDistribution)
                                                                                        .sort((a, b) => b[1] - a[1])
                                                                                        .slice(0, 8)
                                                                                        .map(([kind, count]) => {
                                                                                            const total = Object.values(analysisData.kindDistribution!).reduce((a, b) => a + b, 0)
                                                                                            const percentage = ((count / total) * 100).toFixed(1)
                                                                                            return (
                                                                                                <div key={kind} className="flex items-center gap-2">
                                                                                                    <div className="w-16 text-xs text-white/60 truncate" title={kind}>{kind}</div>
                                                                                                    <div className="flex-1 bg-white/10 rounded-full h-2 overflow-hidden">
                                                                                                        <div
                                                                                                            className="h-full bg-blue-500/60 rounded-full"
                                                                                                            style={{ width: `${percentage}%` }}
                                                                                                        />
                                                                                                    </div>
                                                                                                    <div className="w-12 text-xs text-white/40 text-right">{count}</div>
                                                                                                </div>
                                                                                            )
                                                                                        })}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* P2: Advanced Visualizations */}
                                                                <div className="mt-4 pt-4 border-t border-white/10">
                                                                    <h3 className="text-sm font-medium text-white/80 mb-3">Advanced Analysis</h3>
                                                                    <div className="space-y-3">
                                                                        {/* Persistence Diagram */}
                                                                        <details className="group bg-white/5 rounded-lg">
                                                                            <summary className="cursor-pointer text-white/70 hover:text-white p-3 text-sm flex items-center gap-2">
                                                                                <ChevronDownIcon className="w-4 h-4 transition-transform group-open:rotate-180" />
                                                                                Persistence Diagram
                                                                                {!analysisData.persistenceDiagrams && <span className="text-white/30 ml-1 text-xs">{analysisLoading ? '(loading...)' : analysisData.persistenceStatus ? `(${analysisData.persistenceStatus})` : '(n/a)'}</span>}
                                                                            </summary>
                                                                            <div className="px-3 pb-3 border-t border-white/10">
                                                                                {/* Formula explanation */}
                                                                                <details className="mt-2 mb-3">
                                                                                    <summary className="cursor-pointer text-xs text-white/50 hover:text-white/70">Show formula</summary>
                                                                                    <div className="mt-2 text-xs text-white/60">
                                                                                        <MarkdownRenderer content={`**Persistent Homology** tracks topological features across a filtration.

Each point $(b, d)$ represents a feature:
- **birth** $b$: when the feature appears
- **death** $d$: when the feature disappears
- **persistence** $= d - b$: feature lifetime

$H_0$: connected components (dim-0, blue points)
$H_1$: cycles/loops (dim-1, orange points)

Points far from diagonal have high persistence = robust features.`} />
                                                                                    </div>
                                                                                </details>
                                                                                {analysisData.persistenceDiagrams && (
                                                                                    <>
                                                                                        <div className="bg-black/30 rounded p-3 h-48 relative">
                                                                                            <svg viewBox="0 0 100 100" className="w-full h-full">
                                                                                                <line x1="0" y1="100" x2="100" y2="0" stroke="#444" strokeWidth="0.5" />
                                                                                                <text x="50" y="98" fontSize="8" fill="#888" textAnchor="middle">birth</text>
                                                                                                <text x="2" y="50" fontSize="8" fill="#888" transform="rotate(-90 5 50)">death</text>
                                                                                                {(analysisData.persistenceDiagrams['0'] || []).slice(0, 50).map((pt, i) => (
                                                                                                    <circle key={`h0-${i}`} cx={pt.birth * 100} cy={100 - (pt.death !== null ? pt.death * 100 : 100)} r="3" fill="#3b82f6" opacity="0.7" />
                                                                                                ))}
                                                                                                {(analysisData.persistenceDiagrams['1'] || []).slice(0, 50).map((pt, i) => (
                                                                                                    <circle key={`h1-${i}`} cx={pt.birth * 100} cy={100 - (pt.death !== null ? pt.death * 100 : 100)} r="3" fill="#f97316" opacity="0.7" />
                                                                                                ))}
                                                                                            </svg>
                                                                                            <div className="absolute bottom-2 right-2 text-xs text-white/50 flex items-center gap-3">
                                                                                                <span><span className="inline-block w-3 h-3 bg-blue-500 rounded-full mr-1" />H₀</span>
                                                                                                <span><span className="inline-block w-3 h-3 bg-orange-500 rounded-full mr-1" />H₁</span>
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="text-xs text-white/50 mt-2">
                                                                                            Points far from diagonal = long-lived topological features
                                                                                        </div>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </details>

                                                                        {/* Mapper Graph */}
                                                                        <details className="group bg-white/5 rounded-lg">
                                                                            <summary className="cursor-pointer text-white/70 hover:text-white p-3 text-sm flex items-center gap-2">
                                                                                <ChevronDownIcon className="w-4 h-4 transition-transform group-open:rotate-180" />
                                                                                Mapper Graph
                                                                                {!analysisData.mapperGraph && <span className="text-white/30 ml-1 text-xs">{analysisLoading ? '(loading...)' : '(n/a)'}</span>}
                                                                            </summary>
                                                                            <div className="px-3 pb-3 border-t border-white/10">
                                                                                {/* Formula explanation */}
                                                                                <details className="mt-2 mb-3">
                                                                                    <summary className="cursor-pointer text-xs text-white/50 hover:text-white/70">Show formula</summary>
                                                                                    <div className="mt-2 text-xs text-white/60">
                                                                                        <MarkdownRenderer content={`**Mapper Algorithm** creates a simplified topological skeleton:

1. Apply filter function $f: G \\to \\mathbb{R}$ (e.g., degree)
2. Cover range with overlapping intervals $U_i$
3. Cluster nodes in each $f^{-1}(U_i)$
4. Connect clusters sharing nodes

$$\\text{Mapper}(G, f) = \\text{NerveComplex}(\\{C_{i,k}\\})$$

Node size = cluster size. Edges = shared members.`} />
                                                                                    </div>
                                                                                </details>
                                                                                {analysisData.mapperGraph && (
                                                                                    <>
                                                                                        <div className="bg-black/30 rounded p-3 h-48 relative">
                                                                                            <svg viewBox="0 0 100 100" className="w-full h-full">
                                                                                                {analysisData.mapperGraph.edges.map((e, i) => {
                                                                                                    const nodes = analysisData.mapperGraph!.nodes
                                                                                                    const s = nodes.find(n => n.id === e.source)
                                                                                                    const t = nodes.find(n => n.id === e.target)
                                                                                                    if (!s || !t) return null
                                                                                                    const sx = s.filter_mean * 80 + 10
                                                                                                    const sy = 20 + (s.id % 6) * 12
                                                                                                    const tx = t.filter_mean * 80 + 10
                                                                                                    const ty = 20 + (t.id % 6) * 12
                                                                                                    return <line key={`edge-${i}`} x1={sx} y1={sy} x2={tx} y2={ty} stroke="#666" strokeWidth="0.5" />
                                                                                                })}
                                                                                                {analysisData.mapperGraph.nodes.map((n) => {
                                                                                                    const x = n.filter_mean * 80 + 10
                                                                                                    const y = 20 + (n.id % 6) * 12
                                                                                                    const r = Math.max(3, Math.min(10, Math.sqrt(n.size) * 1.5))
                                                                                                    return (
                                                                                                        <circle key={`node-${n.id}`} cx={x} cy={y} r={r} fill="#22c55e" opacity="0.8">
                                                                                                            <title>Cluster {n.id}: {n.size} nodes</title>
                                                                                                        </circle>
                                                                                                    )
                                                                                                })}
                                                                                            </svg>
                                                                                        </div>
                                                                                        <div className="text-xs text-white/50 mt-2">
                                                                                            {analysisData.mapperGraph.nodes.length} clusters, {analysisData.mapperGraph.edges.length} connections
                                                                                        </div>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </details>

                                                                        {/* Correlation Heatmap */}
                                                                        <details className="group bg-white/5 rounded-lg">
                                                                            <summary className="cursor-pointer text-white/70 hover:text-white p-3 text-sm flex items-center gap-2">
                                                                                <ChevronDownIcon className="w-4 h-4 transition-transform group-open:rotate-180" />
                                                                                Metric Correlations
                                                                                {!analysisData.correlationMatrix && <span className="text-white/30 ml-1 text-xs">{analysisLoading ? '(loading...)' : '(n/a)'}</span>}
                                                                            </summary>
                                                                            <div className="px-3 pb-3 border-t border-white/10">
                                                                                {/* Formula explanation */}
                                                                                <details className="mt-2 mb-3">
                                                                                    <summary className="cursor-pointer text-xs text-white/50 hover:text-white/70">Show formula</summary>
                                                                                    <div className="mt-2 text-xs text-white/60">
                                                                                        <MarkdownRenderer content={`**Spearman Rank Correlation** measures monotonic relationships:

$$\\rho = 1 - \\frac{6 \\sum d_i^2}{n(n^2-1)}$$

where $d_i$ = difference in ranks for node $i$.

- $\\rho = 1$: perfect positive correlation
- $\\rho = -1$: perfect negative correlation
- $\\rho = 0$: no correlation`} />
                                                                                    </div>
                                                                                </details>
                                                                                {analysisData.correlationMatrix && analysisData.correlationMatrix.metrics.length > 0 && (
                                                                                    <>
                                                                                        <div className="bg-black/30 rounded p-3 overflow-x-auto">
                                                                                            <table className="text-xs text-white/60 w-full">
                                                                                                <thead>
                                                                                                    <tr>
                                                                                                        <th className="p-1"></th>
                                                                                                        {analysisData.correlationMatrix.metrics.map(m => (
                                                                                                            <th key={m} className="p-1 font-normal truncate max-w-[50px]" title={m}>
                                                                                                                {m.slice(0, 5)}
                                                                                                            </th>
                                                                                                        ))}
                                                                                                    </tr>
                                                                                                </thead>
                                                                                                <tbody>
                                                                                                    {analysisData.correlationMatrix.matrix.map((row, i) => (
                                                                                                        <tr key={i}>
                                                                                                            <td className="p-1 font-normal truncate max-w-[50px]" title={analysisData.correlationMatrix!.metrics[i]}>
                                                                                                                {analysisData.correlationMatrix!.metrics[i].slice(0, 5)}
                                                                                                            </td>
                                                                                                            {row.map((val, j) => {
                                                                                                                const intensity = Math.abs(val)
                                                                                                                const bg = val > 0.1 ? `rgba(34, 197, 94, ${intensity * 0.8})`
                                                                                                                        : val < -0.1 ? `rgba(239, 68, 68, ${intensity * 0.8})`
                                                                                                                        : 'transparent'
                                                                                                                return (
                                                                                                                    <td key={j} className="p-1 text-center" style={{ backgroundColor: bg }}
                                                                                                                        title={`${analysisData.correlationMatrix!.metrics[i]} vs ${analysisData.correlationMatrix!.metrics[j]}: ${val.toFixed(2)}`}>
                                                                                                                        {val.toFixed(1)}
                                                                                                                    </td>
                                                                                                                )
                                                                                                            })}
                                                                                                        </tr>
                                                                                                    ))}
                                                                                                </tbody>
                                                                                            </table>
                                                                                        </div>
                                                                                        <div className="text-xs text-white/50 mt-2">
                                                                                            <span className="text-green-400">■</span> positive, <span className="text-red-400">■</span> negative (Spearman ρ)
                                                                                        </div>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </details>
                                                                    </div>
                                                                </div>

                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">
                                                                    Click anywhere to close
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {/* Other Info Modals */}
                                                    {expandedInfoTips.has('hideTechnical') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('hideTechnical'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Hide Technical Nodes</h2>
                                                                <p className="text-sm text-white/70">Hide auto-generated Lean nodes that are typically implementation details:</p>
                                                                <ul className="mt-3 text-sm text-white/60 space-y-1 list-disc list-inside">
                                                                    <li>Type class instances</li>
                                                                    <li>Coercions</li>
                                                                    <li>Decidability proofs</li>
                                                                    <li>Other compiler-generated nodes</li>
                                                                </ul>
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {expandedInfoTips.has('transitiveReduction') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('transitiveReduction'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Transitive Reduction</h2>
                                                                <p className="text-sm text-white/70 mb-3">Remove redundant edges to show only essential dependencies.</p>
                                                                <div className="bg-white/5 rounded-lg p-3 text-sm text-white/60">
                                                                    <p className="font-medium text-white/80 mb-2">Example:</p>
                                                                    <p>If path exists: A → B → C</p>
                                                                    <p>Then hide direct edge: A → C</p>
                                                                </div>
                                                                <p className="text-sm text-white/50 mt-3">This reveals the true hierarchical structure of dependencies.</p>
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {expandedInfoTips.has('hideOrphaned') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('hideOrphaned'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Hide Orphaned Nodes</h2>
                                                                <p className="text-sm text-white/70">Hide nodes that have no connections to other visible nodes.</p>
                                                                <p className="text-sm text-white/50 mt-3">Useful for cleaning up isolated nodes that don&apos;t contribute to the dependency structure.</p>
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {expandedInfoTips.has('layoutOptimization') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('layoutOptimization'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Layout Optimization</h2>
                                                                <p className="text-sm text-white/70 mb-3">
                                                                    Apply additional forces to organize the graph layout beyond basic physics.
                                                                </p>
                                                                <ul className="text-sm text-white/60 space-y-2">
                                                                    <li><strong className="text-white/80">Namespace Clustering:</strong> Group nodes by Lean module hierarchy</li>
                                                                    <li><strong className="text-white/80">Community Clustering:</strong> Group by detected graph communities (Louvain)</li>
                                                                    <li><strong className="text-white/80">Adaptive Springs:</strong> Longer edges for high-degree hub nodes</li>
                                                                </ul>
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {expandedInfoTips.has('clustering') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('clustering'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Namespace Clustering</h2>
                                                                <p className="text-sm text-white/70 mb-4">Group nodes by their Lean namespace hierarchy. Nodes in the same module cluster together.</p>
                                                                <MarkdownRenderer content={`**Force Model:**

$$F_{attract} = \\frac{k}{d^2 + 1}$$

$$F_{repel} = \\frac{s}{d^2 + 1}$$

where:
- $k$ = clustering strength
- $s$ = cluster separation
- $d$ = distance to/from centroid

**Depth** controls the namespace level used for grouping (e.g., depth 2 groups \`Mathlib.Algebra\` separately from \`Mathlib.Analysis\`).`} />
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {expandedInfoTips.has('adaptiveSprings') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('adaptiveSprings'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Adaptive Edge Length</h2>
                                                                <p className="text-sm text-white/70 mb-4">High-degree hub nodes get longer edges automatically, preventing star-shaped clustering.</p>
                                                                <MarkdownRenderer content={`**Modes:**

**Square Root** (recommended):
$$L = L_0 + s \\cdot \\sqrt{\\deg(v)}$$

**Logarithmic** (gentler scaling):
$$L = L_0 + s \\cdot \\ln(\\deg(v) + 1)$$

**Linear** (aggressive):
$$L = L_0 + s \\cdot \\deg(v)$$

where:
- $L$ = final edge length
- $L_0$ = base edge length
- $s$ = scale factor
- $\\deg(v)$ = degree of the hub node`} />
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {expandedInfoTips.has('communityClustering') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('communityClustering'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Graph-Based Clustering</h2>
                                                                <p className="text-sm text-white/70 mb-4">Group nodes by graph structure. The clustering method depends on your Color Mapping selection:</p>
                                                                <MarkdownRenderer content={`**Clustering Methods:**

- **Community** (Louvain): Groups densely connected nodes. Best for finding modules.
- **Layer** (Topological): Groups by dependency depth. Nodes at same "level" cluster together.
- **Spectral** (Laplacian): Uses eigenvectors of graph Laplacian. May find hidden structure.

**Force Model:**

Nodes in the same cluster attract each other:

$$F_{attract} = \\frac{k}{d^2 + 1}$$

Different clusters repel:

$$F_{repel} = \\frac{s}{d^2 + 1}$$

**Usage:** Select clustering type in Color Mapping, then enable here.`} />
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {expandedInfoTips.has('physics') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('physics'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Physics Simulation</h2>
                                                                <p className="text-sm text-white/70 mb-4">Force-directed layout using a physics simulation.</p>
                                                                <MarkdownRenderer content={`**Forces:**

**Repulsion** (between all nodes):
$$F_r = \\frac{k_r}{d^2}$$

**Spring** (between connected nodes):
$$F_s = k_s \\cdot (d - L_0)$$

**Center Gravity**:
$$F_c = k_c \\cdot d_{center}$$

**Parameters:**
- *Repulsion*: How strongly nodes push each other apart
- *Edge Length*: Target distance between connected nodes
- *Edge Tension*: How strongly edges pull nodes together
- *Center Gravity*: Pull towards graph center
- *Damping*: Velocity decay (higher = faster settling)
- *Boundary*: Maximum distance from center`} />
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {/* Color Mapping Info Modal */}
                                                    {expandedInfoTips.has('colorMapping') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('colorMapping'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Color Mapping Options</h2>
                                                                <p className="text-sm text-white/60 mb-4">Click each option to see the formula and details.</p>
                                                                <div className="space-y-2 text-sm">
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Kind</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`Color by Lean declaration type:
- **theorem** (purple) - proven propositions
- **lemma** (blue) - helper theorems
- **def** (green) - definitions
- **axiom** (yellow) - foundational assumptions
- **instance** (orange) - typeclass instances`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Namespace</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`Color by top-level namespace (e.g., Mathlib.Algebra, Init.Core).

Each unique namespace gets a distinct color from the palette.`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Community</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`**Louvain community detection** groups densely connected nodes.

$$Q = \\frac{1}{2m} \\sum_{ij} \\left[ A_{ij} - \\frac{k_i k_j}{2m} \\right] \\delta(c_i, c_j)$$

Maximizes modularity $Q$ by iteratively merging communities. Same color = same community.`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Layer</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`**Topological layer** based on dependency depth.

$$\\text{depth}(v) = \\max_{u \\in \\text{deps}(v)} \\text{depth}(u) + 1$$

Light blue = axioms/defs (depth 0), Dark blue = complex theorems (high depth).`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Spectral</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`**Spectral clustering** using graph Laplacian eigenvectors.

$$L = D - A$$

where $D$ is the degree matrix and $A$ is the adjacency matrix. Clusters using the $k$ smallest eigenvectors of $L$.

May reveal structure that Louvain misses (Fiedler vector partitioning).`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Curvature</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`**Forman-Ricci curvature** measures local graph geometry.

$$F(e) = 4 - \\deg(u) - \\deg(v) + 3 \\cdot |\\triangle(e)|$$

- Negative (red) = branching points (high degree, few triangles)
- Zero (white) = linear chains
- Positive (green) = clustered regions (many triangles)`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Anomaly</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`**Z-score anomaly detection** highlights statistical outliers.

$$z = \\frac{x - \\mu}{\\sigma}, \\quad \\text{anomaly if } |z| > 2$$

- Red = anomalous node (unusual metrics)
- Gray = normal node`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Embedding</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`**Spectral embedding + k-means clustering**.

1. Compute graph Laplacian eigenvectors
2. Embed nodes in $\\mathbb{R}^k$ space
3. Apply k-means clustering

Groups structurally similar nodes based on their position in the embedding space.`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Motif</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`**Dominant motif pattern** for each node:
- **chain** (blue): $A \\to B \\to C$ — sequential
- **fork** (green): $A \\to B, A \\to C$ — one feeds many
- **join** (orange): $A \\to C, B \\to C$ — many feed one
- **diamond** (purple): $A \\to B \\to D, A \\to C \\to D$ — parallel paths
- **none** (gray): no dominant pattern`} />
                                                                        </div>
                                                                    </details>
                                                                </div>
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {/* Size Mapping Info Modal */}
                                                    {expandedInfoTips.has('sizeMapping') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('sizeMapping'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Size Mapping Options</h2>
                                                                <p className="text-sm text-white/60 mb-4">Click each option to see the formula and details.</p>
                                                                <div className="space-y-2 text-sm">
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Default</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`Uniform node size. All nodes rendered at the same size regardless of metrics.`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">PageRank</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`**PageRank** measures node importance recursively.

$$PR(v) = \\frac{1-d}{N} + d \\sum_{u \\to v} \\frac{PR(u)}{\\text{outdeg}(u)}$$

where $d = 0.85$ (damping factor). Larger = referenced by other important nodes.`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">In-degree</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`**In-degree**: count of incoming edges.

$$\\text{indeg}(v) = |\\{u : (u,v) \\in E\\}|$$

Larger = more nodes depend on it directly. Simple popularity measure.`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Betweenness</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`**Betweenness centrality**: fraction of shortest paths through node.

$$BC(v) = \\sum_{s \\neq v \\neq t} \\frac{\\sigma_{st}(v)}{\\sigma_{st}}$$

Larger = bridge/connector node. Many shortest paths pass through it.`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Depth</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`**Dependency depth**: longest path from axioms.

$$\\text{depth}(v) = \\max_{u \\in \\text{deps}(v)} \\text{depth}(u) + 1$$

with $\\text{depth}(\\text{axiom}) = 0$. Larger = further from axioms.`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Bottleneck</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`**Bottleneck score**: dependents vs dependencies ratio.

$$\\text{bottleneck}(v) = \\frac{\\text{indeg}(v)}{\\text{outdeg}(v) + 1}$$

Larger = foundational lemma. Many depend on it, it depends on few.`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Reachability</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`**Transitive dependents**: all nodes that transitively depend on this.

$$\\text{reach}(v) = |\\text{ancestors}(v)|$$

Larger = breaking this affects more theorems. Impact measure.`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Clustering</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`**Clustering coefficient**: neighbor connectivity.

$$C(v) = \\frac{2 \\cdot |\\triangle(v)|}{\\deg(v) \\cdot (\\deg(v)-1)}$$

Larger = neighbors are well-connected. Part of a tightly-knit group.`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Katz</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`**Katz centrality**: influence via all walks.

$$x_i = \\alpha \\sum_j A_{ij} x_j + \\beta$$

where $\\alpha < 1/\\lambda_{\\max}$. Better for DAGs than PageRank.`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Hub</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`**HITS hub score**: points to good authorities.

$$\\text{hub}(v) = \\sum_{u \\in \\text{succ}(v)} \\text{auth}(u)$$

Iterative power method. Larger = comprehensive proof using many fundamentals.`} />
                                                                        </div>
                                                                    </details>
                                                                    <details className="bg-white/5 rounded-lg group">
                                                                        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/10 rounded-lg transition-colors">
                                                                            <span className="font-medium text-white">Authority</span>
                                                                            <span className="text-white/40 text-xs group-open:rotate-180 transition-transform">▼</span>
                                                                        </summary>
                                                                        <div className="px-3 pb-3 text-white/60 border-t border-white/10 pt-2">
                                                                            <MarkdownRenderer content={`**HITS authority score**: pointed to by good hubs.

$$\\text{auth}(v) = \\sum_{u \\in \\text{pred}(v)} \\text{hub}(u)$$

Iterative power method. Larger = fundamental theorem used by many proofs.`} />
                                                                        </div>
                                                                    </details>
                                                                </div>
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {!collapsedSections.has('analysis') && (
                                                    <div className="ml-5 mt-2 space-y-3">
                                                        {/* Color Mapping */}
                                                        <div>
                                                            <div className="flex items-center gap-1">
                                                                <label className="text-[10px] text-white/40 uppercase tracking-wider">Color Mapping</label>
                                                                <button
                                                                    onClick={() => setExpandedInfoTips(prev => new Set(prev).add('colorMapping'))}
                                                                    className="text-white/30 hover:text-white/60 transition-colors"
                                                                    title="Color mapping options explained"
                                                                >
                                                                    <InformationCircleIcon className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {([
                                                                    { mode: 'kind' as const, label: 'Kind', data: true, tooltip: 'Color by node type (theorem, lemma, def, etc.)' },
                                                                    { mode: 'namespace' as const, label: 'Namespace', data: namespaceData, tooltip: 'Color by top-level namespace (e.g., Mathlib, Init)' },
                                                                    { mode: 'community' as const, label: 'Community', data: analysisData.communities, tooltip: 'Color by Louvain community detection' },
                                                                    { mode: 'layer' as const, label: 'Layer', data: analysisData.layers, tooltip: 'Color by topological layer (dependency depth)' },
                                                                    { mode: 'spectral' as const, label: 'Spectral', data: analysisData.spectralClusters, tooltip: 'Color by spectral clustering (graph Laplacian)' },
                                                                    { mode: 'curvature' as const, label: 'Curvature', data: analysisData.curvature, tooltip: 'Color by Ricci curvature (red=branching, green=clustered)' },
                                                                    { mode: 'anomaly' as const, label: 'Anomaly', data: analysisData.anomalies, tooltip: 'Highlight anomalous nodes (red=anomaly, gray=normal)' },
                                                                    { mode: 'embedding' as const, label: 'Embedding', data: analysisData.embeddingClusters, tooltip: 'Color by spectral embedding + k-means clusters' },
                                                                    { mode: 'motif' as const, label: 'Motif', data: analysisData.dominantMotif, tooltip: 'Color by dominant motif pattern (chain/fork/join/diamond)' },
                                                                ]).map(({ mode, label, data, tooltip }) => (
                                                                    <button
                                                                        key={mode}
                                                                        title={tooltip}
                                                                        onClick={() => setColorMappingMode(mode)}
                                                                        className={`px-2 py-1 text-[10px] rounded transition-colors ${
                                                                            colorMappingMode === mode
                                                                                ? 'bg-blue-500/30 text-blue-300'
                                                                                : 'bg-white/10 text-white/60 hover:bg-white/20'
                                                                        } ${!data ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                        disabled={!data}
                                                                    >
                                                                        {label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Size Mapping */}
                                                        <div>
                                                            <div className="flex items-center gap-1">
                                                                <label className="text-[10px] text-white/40 uppercase tracking-wider">Size Mapping</label>
                                                                <button
                                                                    onClick={() => setExpandedInfoTips(prev => new Set(prev).add('sizeMapping'))}
                                                                    className="text-white/30 hover:text-white/60 transition-colors"
                                                                    title="Size mapping options explained"
                                                                >
                                                                    <InformationCircleIcon className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {([
                                                                    { mode: 'default' as const, label: 'Default', data: true, tooltip: 'Uniform node size' },
                                                                    { mode: 'pagerank' as const, label: 'PageRank', data: analysisData.pagerank, tooltip: 'Size by importance (referenced by important nodes)' },
                                                                    { mode: 'indegree' as const, label: 'In-deg', data: analysisData.indegree, tooltip: 'Size by number of incoming edges (how many depend on it)' },
                                                                    { mode: 'betweenness' as const, label: 'Between', data: analysisData.betweenness, tooltip: 'Size by betweenness centrality (bridge nodes connecting different parts)' },
                                                                    { mode: 'depth' as const, label: 'Depth', data: analysisData.depths, tooltip: 'Size by dependency depth (distance from axioms)' },
                                                                    { mode: 'bottleneck' as const, label: 'Bottleneck', data: analysisData.bottleneckScores, tooltip: 'Size by bottleneck score (dependents / dependencies ratio)' },
                                                                    { mode: 'reachability' as const, label: 'Reach', data: analysisData.reachability, tooltip: 'Size by reachability (how many nodes depend on this transitively)' },
                                                                    { mode: 'clustering' as const, label: 'Cluster', data: analysisData.clustering, tooltip: 'Size by clustering coefficient (local connectivity)' },
                                                                    { mode: 'katz' as const, label: 'Katz', data: analysisData.katz, tooltip: 'Size by Katz centrality (walks-based influence)' },
                                                                    { mode: 'hub' as const, label: 'Hub', data: analysisData.hub, tooltip: 'Size by hub score (comprehensive proofs)' },
                                                                    { mode: 'authority' as const, label: 'Authority', data: analysisData.authority, tooltip: 'Size by authority score (fundamental theorems)' },
                                                                ]).map(({ mode, label, data, tooltip }) => (
                                                                    <button
                                                                        key={mode}
                                                                        title={tooltip}
                                                                        onClick={() => setSizeMappingMode(mode)}
                                                                        className={`px-2 py-1 text-[10px] rounded transition-colors ${
                                                                            sizeMappingMode === mode
                                                                                ? 'bg-blue-500/30 text-blue-300'
                                                                                : 'bg-white/10 text-white/60 hover:bg-white/20'
                                                                        } ${!data ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                        disabled={!data}
                                                                    >
                                                                        {label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Size Curve Editor - only show when Size Mapping is active */}
                                                        {sizeMappingMode !== 'default' && (
                                                            <div className="mt-3">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="text-[10px] text-white/50">Size Curve</span>
                                                                    <span className="text-[10px] text-white/30">
                                                                        {sizeCurveControl.y > sizeCurveControl.x + 0.1 ? '↑ Boost small values' :
                                                                         sizeCurveControl.y < sizeCurveControl.x - 0.1 ? '↓ Boost large values' : '— Linear'}
                                                                    </span>
                                                                </div>
                                                                <div
                                                                    className="relative w-full bg-gradient-to-br from-white/5 to-transparent rounded-lg border border-white/10 select-none"
                                                                    style={{ aspectRatio: '1 / 1' }}
                                                                >
                                                                    <svg viewBox="0 0 100 100" className="w-full h-full">
                                                                        {/* Diagonal reference (linear) */}
                                                                        <line x1="0" y1="100" x2="100" y2="0" stroke="#ffffff10" strokeWidth="1" strokeDasharray="4,4" />
                                                                        {/* Control point guide lines */}
                                                                        <line
                                                                            x1="0" y1="100"
                                                                            x2={sizeCurveControl.x * 100} y2={100 - sizeCurveControl.y * 100}
                                                                            stroke="#3b82f650" strokeWidth="1"
                                                                        />
                                                                        <line
                                                                            x1={sizeCurveControl.x * 100} y1={100 - sizeCurveControl.y * 100}
                                                                            x2="100" y2="0"
                                                                            stroke="#3b82f650" strokeWidth="1"
                                                                        />
                                                                        {/* Bezier curve */}
                                                                        <path
                                                                            d={`M 0,100 Q ${sizeCurveControl.x * 100},${100 - sizeCurveControl.y * 100} 100,0`}
                                                                            fill="none"
                                                                            stroke="#3b82f6"
                                                                            strokeWidth="2.5"
                                                                        />
                                                                        {/* Start and end points */}
                                                                        <circle cx="0" cy="100" r="4" fill="#3b82f6" />
                                                                        <circle cx="100" cy="0" r="4" fill="#3b82f6" />
                                                                    </svg>
                                                                    {/* Draggable control point */}
                                                                    <div
                                                                        className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-white border-2 border-blue-500 cursor-grab active:cursor-grabbing shadow-lg hover:scale-110 transition-transform"
                                                                        style={{
                                                                            left: `${sizeCurveControl.x * 100}%`,
                                                                            top: `${(1 - sizeCurveControl.y) * 100}%`,
                                                                        }}
                                                                        onMouseDown={(e) => {
                                                                            e.stopPropagation()
                                                                            const parent = e.currentTarget.parentElement!
                                                                            const rect = parent.getBoundingClientRect()
                                                                            const updateControl = (clientX: number, clientY: number) => {
                                                                                const x = Math.max(0.05, Math.min(0.95, (clientX - rect.left) / rect.width))
                                                                                const y = 1 - Math.max(0.05, Math.min(0.95, (clientY - rect.top) / rect.height))
                                                                                setSizeCurveControl({ x, y })
                                                                            }
                                                                            const onMove = (ev: MouseEvent) => updateControl(ev.clientX, ev.clientY)
                                                                            const onUp = () => {
                                                                                window.removeEventListener('mousemove', onMove)
                                                                                window.removeEventListener('mouseup', onUp)
                                                                            }
                                                                            window.addEventListener('mousemove', onMove)
                                                                            window.addEventListener('mouseup', onUp)
                                                                        }}
                                                                    />
                                                                    {/* Axis labels */}
                                                                    <div className="absolute bottom-1 left-1 text-[9px] text-white/20">0</div>
                                                                    <div className="absolute bottom-1 right-1 text-[9px] text-white/20">metric →</div>
                                                                    <div className="absolute top-1 left-1 text-[9px] text-white/20">size ↑</div>
                                                                </div>
                                                            </div>
                                                        )}

                                                    </div>
                                                    )}
                                                </div>
                                                </SortableSection>

                                                {/* === ACTIONS === */}
                                                <SortableSection id="actions" order={sectionOrder.indexOf('actions')}>
                                                <div className="border-t border-white/10 pt-3">
                                                    <div className="pr-5">
                                                        <button
                                                            onClick={() => toggleSection('actions')}
                                                            className="w-full flex items-center gap-2 py-1.5 text-white/60 hover:text-white/80 transition-colors group"
                                                        >
                                                            <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${collapsedSections.has('actions') ? '-rotate-90' : ''}`} />
                                                            <WrenchScrewdriverIcon className="w-4 h-4" />
                                                            <span className="text-[10px] uppercase tracking-wider font-medium">Actions</span>
                                                        </button>
                                                    </div>
                                                    {!collapsedSections.has('actions') && (
                                                    <div className="ml-5 mt-1 space-y-2">
                                                    {viewMode === '3d' && (
                                                        <button
                                                            onClick={() => updatePhysicsUndoable({ ...DEFAULT_PHYSICS })}
                                                            className="w-full py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 rounded transition-colors"
                                                        >
                                                            Reset Physics
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={async () => {
                                                            // Load all nodes from graph into canvas
                                                            const allNodeIds = astrolabeNodes.map(n => n.id)
                                                            await graphActions.addNodesToCanvas(allNodeIds)
                                                        }}
                                                        disabled={astrolabeNodes.length === 0 || visibleNodes.length === astrolabeNodes.length}
                                                        className="w-full py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        Load All Nodes ({astrolabeNodes.length})
                                                    </button>
                                                    <button
                                                        onClick={handleClearCanvas}
                                                        disabled={canvasNodes.length === 0}
                                                        className="w-full py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        Clear Canvas
                                                    </button>
                                                    <button
                                                        onClick={handleResetAllData}
                                                        className="w-full py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors"
                                                    >
                                                        Reset All Data
                                                    </button>
                                                    <p className="text-[10px] text-white/30 text-center">
                                                        Reset deletes all custom nodes, edges & metadata
                                                    </p>
                                                    </div>
                                                    )}
                                                </div>
                                                </SortableSection>
                                            </div>
                                            </SortableContext>
                                            </DndContext>

            {activeStatFormula && statFormulaExplanations[activeStatFormula] && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => setActiveStatFormula(null)}
                >
                    <div
                        className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-white">
                                {statFormulaExplanations[activeStatFormula].title}
                            </h3>
                            <button
                                onClick={() => setActiveStatFormula(null)}
                                className="p-1 hover:bg-white/10 rounded transition-colors"
                            >
                                <XMarkIcon className="w-5 h-5 text-white/60" />
                            </button>
                        </div>
                        <div className="text-base text-white/90 leading-relaxed">
                            <MarkdownRenderer content={statFormulaExplanations[activeStatFormula].content} />
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
