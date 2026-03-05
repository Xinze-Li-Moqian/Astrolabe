// @ts-nocheck
import { Panel, PanelResizeHandle } from 'react-resizable-panels'
import { SearchPanel } from '@/components/SearchPanel'
import { SettingsPanel } from '@/components/panels/SettingsPanel'

export function EditorLeftSidebar({ ctx }: any) {
    const {
        searchPanelOpen,
        leftPanelMode,
        setLeftPanelMode,
        searchPanelKey,
        selectedNode,
        handleSearchResultSelect,
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
        visibleNodes,
        canvasNodes,
        handleClearCanvas,
        handleResetAllData,
    } = ctx

    if (!searchPanelOpen) return null

    return (
        <>
            <Panel defaultSize={18} minSize={15} maxSize={35}>
                <div className="h-full flex flex-col bg-black border-r border-white/10">
                    <div className="flex border-b border-white/10 shrink-0">
                        <button
                            onClick={() => setLeftPanelMode('settings')}
                            className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                                leftPanelMode === 'settings'
                                    ? 'text-white/90 bg-white/5'
                                    : 'text-white/40 hover:text-white/60'
                            }`}
                        >
                            Settings
                        </button>
                        <button
                            onClick={() => setLeftPanelMode('search')}
                            className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                                leftPanelMode === 'search'
                                    ? 'text-white/90 bg-white/5'
                                    : 'text-white/40 hover:text-white/60'
                            }`}
                        >
                            Search
                        </button>
                    </div>

                    <div className="flex-1 overflow-hidden">
                        {leftPanelMode === 'search' ? (
                            <SearchPanel
                                key={searchPanelKey}
                                className="h-full"
                                selectedNodeId={selectedNode?.id}
                                onNodeSelect={handleSearchResultSelect}
                            />
                        ) : (
                            <SettingsPanel
                                viewMode={viewMode}
                                filterOptions={filterOptions}
                                updateFilterOptionsUndoable={updateFilterOptionsUndoable}
                                physics={physics}
                                updatePhysicsUndoable={updatePhysicsUndoable}
                                analysisData={analysisData}
                                analysisLoading={analysisLoading}
                                sizeMappingMode={sizeMappingMode}
                                setSizeMappingMode={setSizeMappingMode}
                                sizeCurveControl={sizeCurveControl}
                                setSizeCurveControl={setSizeCurveControl}
                                colorMappingMode={colorMappingMode}
                                setColorMappingMode={setColorMappingMode}
                                layoutClusterMode={layoutClusterMode}
                                setLayoutClusterMode={setLayoutClusterMode}
                                namespaceDepthPreview={namespaceDepthPreview}
                                namespaceData={namespaceData}
                                namespacesOnCanvas={namespacesOnCanvas}
                                handleNamespaceClick={handleNamespaceClick}
                                astrolabeNodes={astrolabeNodes}
                                visibleNodes={visibleNodes}
                                canvasNodes={canvasNodes}
                                handleClearCanvas={handleClearCanvas}
                                handleResetAllData={handleResetAllData}
                            />
                        )}
                    </div>
                </div>
            </Panel>
            <PanelResizeHandle className="w-2 bg-white/10 hover:bg-blue-500/50 transition-colors cursor-col-resize flex items-center justify-center group">
                <div className="h-12 w-1 bg-white/20 group-hover:bg-white/40 rounded-full" />
            </PanelResizeHandle>
        </>
    )
}
