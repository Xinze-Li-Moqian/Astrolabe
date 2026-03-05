// @ts-nocheck
import { CustomNodeDialog, ResetConfirmDialog, ReloadPromptDialog, ClearCanvasDialog } from '@/components/dialogs/EditorDialogs'

export function EditorOverlays({ ctx }: any) {
    const {
        showCustomNodeDialog,
        setShowCustomNodeDialog,
        customNodeName,
        setCustomNodeName,
        handleCreateCustomNode,
        showResetConfirm,
        setShowResetConfirm,
        confirmResetAllData,
        showReloadPrompt,
        setShowReloadPrompt,
        showClearCanvasDialog,
        setShowClearCanvasDialog,
        canvasNodes,
        selectedNodesToRemove,
        toggleNodeToRemove,
        selectAllNodesToRemove,
        deselectAllNodesToRemove,
        removeSelectedNodes,
        clearAllNodes,
        lspStatus,
        lspBuilding,
    } = ctx

    return (
        <>
            <CustomNodeDialog
                isOpen={showCustomNodeDialog}
                onClose={() => {
                    setShowCustomNodeDialog(false)
                    setCustomNodeName('')
                }}
                customNodeName={customNodeName}
                setCustomNodeName={setCustomNodeName}
                handleCreateCustomNode={handleCreateCustomNode}
            />

            <ResetConfirmDialog
                isOpen={showResetConfirm}
                onClose={() => setShowResetConfirm(false)}
                confirmResetAllData={confirmResetAllData}
            />

            <ReloadPromptDialog
                isOpen={showReloadPrompt}
                onClose={() => setShowReloadPrompt(false)}
            />

            <ClearCanvasDialog
                isOpen={showClearCanvasDialog}
                onClose={() => setShowClearCanvasDialog(false)}
                canvasNodes={canvasNodes}
                selectedNodesToRemove={selectedNodesToRemove}
                toggleNodeToRemove={toggleNodeToRemove}
                selectAllNodesToRemove={selectAllNodesToRemove}
                deselectAllNodesToRemove={deselectAllNodesToRemove}
                removeSelectedNodes={removeSelectedNodes}
                clearAllNodes={clearAllNodes}
            />

            {lspStatus && (
                <div className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 border-t border-white/10 px-4 py-2">
                    <div className="flex items-center gap-2 text-xs text-white/70">
                        {lspBuilding && (
                            <div className="w-3 h-3 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
                        )}
                        <span className={lspBuilding ? 'animate-pulse' : ''}>{lspStatus}</span>
                    </div>
                </div>
            )}
        </>
    )
}
