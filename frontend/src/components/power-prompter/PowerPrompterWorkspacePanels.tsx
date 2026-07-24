import React from 'react';
import { Loader2, Plus, Save, XCircle } from 'lucide-react';
import {
  PowerPrompterCardChainEditor,
  PowerPrompterCardChainEditorRef,
} from '@/components/layout/PowerPrompterCardChainEditor';

type PowerPrompterWorkspacePanelsProps = Record<string, any>;

export function PowerPrompterWorkspacePanels(props: PowerPrompterWorkspacePanelsProps) {
  const {
    currentFile,
    editorRemountTick,
    editorRef,
    cardDocument,
    pipelines = [],
    selectedQueueTargetType,
    isActive,
    isEditorPanelActive,
    prompterPanelMode,
    queueVisualState,
    queueEstimate,
    queueShuffleEnabled,
    settings,
    queueTraversalMode,
    queueSetTarget,
    queueCompletionTick,
    generationPreview,
    generationPreviewHoldMs,
    handleSetGenerationPreviewHoldMs,
    editorInteractionResetTick,
    loraCatalog,
    refreshLoraCatalog,
    requestLoraInfoThroughWebSocket,
    modelCatalog,
    refreshModelCatalog,
    requestModelInfoThroughWebSocket,
    handleCardDocumentChange,
    handleActivePromptTypeProgress,
    handleChainLinkFeedback,
    enabledCSVs,
    globalSearchQuery,
    globalSearchFocusValue,
    globalSearchFocusNonce,
    overlayMode,
    renderQueueTrackerCard,
    setOutputPreviewSnapshot,
    renderQueueManagerView,
    queueEditorEnabled = false,
    queueEditorDraft,
    handleCloseQueueEditor,
    handleSaveQueueEditorDraft,
    queueEditorSaving,
    handleAddQueueEditorDraftAsNewGroup,
    queueEditorDocument,
    isQueueEditorPanelActive,
    queueEditorEstimate,
    handleQueueEditorDocumentChange,
    mobileSelectionMode = false,
  } = props;
  const canShowWorkspace = currentFile || (queueEditorEnabled && prompterPanelMode === 'queue-editor' && queueEditorDraft);
  const isHistoryQueueEditorDraft = queueEditorDraft?.sourceKind === 'history';

  return (
    <div className="flex-1 min-h-0">
      {canShowWorkspace ? (
        <div className="h-full min-h-0 relative">
          {(prompterPanelMode === 'editor' || prompterPanelMode === 'preset-editor') && (
            <div
              data-umbra-powerprompter-card-workspace={prompterPanelMode}
              className="h-full"
            >
              <PowerPrompterCardChainEditor
                key={`${currentFile || 'no-file'}:${editorRemountTick}`}
                ref={editorRef as React.Ref<PowerPrompterCardChainEditorRef>}
                document={cardDocument}
                pipelines={pipelines}
                queueTargetType={selectedQueueTargetType}
                isActive={isActive && isEditorPanelActive}
                outputPreviewActive={isActive && isEditorPanelActive}
                queueVisualState={isEditorPanelActive ? queueVisualState : null}
                queuePreviewPrompts={queueEstimate.setPrompts}
                queuePreviewEntries={queueEstimate.setPromptEntries}
                queueCyclePreviewPrompts={queueEstimate.setCyclePrompts}
                queueCyclePreviewEntries={queueEstimate.setCyclePromptEntries}
                queueShuffleEnabled={queueShuffleEnabled}
                queueShuffleSeed={settings.queueShuffleSeed}
                queueTraversalMode={queueTraversalMode}
                queuePreviewSetId={queueSetTarget}
                queueCompletionTick={isEditorPanelActive ? queueCompletionTick : 0}
                generationPreview={isEditorPanelActive ? generationPreview : null}
                generationPreviewHoldMs={generationPreviewHoldMs}
                onChangeGenerationPreviewHoldMs={handleSetGenerationPreviewHoldMs}
                queueSetTarget={queueSetTarget}
                editorResetTick={editorInteractionResetTick}
                loraCatalog={loraCatalog}
                onRefreshLoraCatalog={refreshLoraCatalog}
                onRequestLoraInfo={requestLoraInfoThroughWebSocket}
                modelCatalog={modelCatalog}
                onRefreshModelCatalog={refreshModelCatalog}
                onRequestModelInfo={requestModelInfoThroughWebSocket}
                onChange={handleCardDocumentChange}
                onActivePromptTypeProgress={handleActivePromptTypeProgress}
                onChainLinkFeedback={handleChainLinkFeedback}
                path={currentFile}
                enabledCSVs={enabledCSVs}
                globalSearchQuery={globalSearchQuery}
                globalSearchFocusValue={globalSearchFocusValue}
                globalSearchFocusNonce={globalSearchFocusNonce}
                overlayMode={overlayMode}
                mobileSelectionMode={mobileSelectionMode}
                queueTrackerCard={isEditorPanelActive ? renderQueueTrackerCard() : null}
                onOutputPreviewSnapshotChange={setOutputPreviewSnapshot}
              />
            </div>
          )}
          {prompterPanelMode === 'queue-manager' && (
            <div className="absolute inset-0">
              {renderQueueManagerView()}
            </div>
          )}
          {queueEditorEnabled && prompterPanelMode === 'queue-editor' && queueEditorDraft && (
            <div data-umbra-queue-editor="" className="absolute inset-0 flex flex-col bg-[#050508]">
              <div data-umbra-queue-editor-header="" className="shrink-0 border-b border-white/10 bg-black/25 px-4 py-2">
                <div data-umbra-queue-editor-header-row="" className="flex items-center gap-2">
                  <div data-umbra-queue-editor-summary="" className="min-w-0 flex-1">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Queue Editor</div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-zinc-300">
                      {isHistoryQueueEditorDraft ? 'Restored historical draft: ' : ''}{queueEditorDraft.label} - Set {queueEditorDraft.activeSetId} - {queueEditorDraft.originalPromptCount} prompt{queueEditorDraft.originalPromptCount === 1 ? '' : 's'} before edit
                    </div>
                  </div>
                  <div data-umbra-queue-editor-actions="" className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCloseQueueEditor}
                      className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300 transition-colors hover:border-white/30 hover:text-zinc-100"
                      title="Close temporary queue editor without applying changes"
                    >
                      <XCircle size={12} />
                      Discard
                    </button>
                    <button
                      type="button"
                      onClick={() => { void handleSaveQueueEditorDraft(); }}
                      disabled={queueEditorSaving || isHistoryQueueEditorDraft}
                      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        queueEditorSaving || isHistoryQueueEditorDraft
                          ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-wait'
                          : 'border-emerald-400/40 bg-emerald-500/12 text-emerald-200 hover:border-emerald-300/60 hover:text-emerald-100'
                      }`}
                      title={isHistoryQueueEditorDraft ? 'Historical editor drafts are safe previews and do not replace a live queue group.' : 'Apply this card setup back to the selected queued group'}
                    >
                      {queueEditorSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      {queueEditorSaving ? 'Saving' : 'Update Group'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { void handleAddQueueEditorDraftAsNewGroup(); }}
                      disabled={queueEditorSaving || isHistoryQueueEditorDraft}
                      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        queueEditorSaving || isHistoryQueueEditorDraft
                          ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-wait'
                          : 'border-cyan-400/40 bg-cyan-500/12 text-cyan-200 hover:border-cyan-300/60 hover:text-cyan-100'
                      }`}
                      title={isHistoryQueueEditorDraft ? 'Historical editor drafts are not attached to a live queue group.' : 'Append this edited setup as a new live queue group'}
                    >
                      {queueEditorSaving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      Add New Group
                    </button>
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1">
                <PowerPrompterCardChainEditor
                  key={`queue-editor:${queueEditorDraft.requestId}`}
                  document={queueEditorDocument}
                  pipelines={pipelines}
                  queueTargetType={selectedQueueTargetType}
                  isActive={isActive && isQueueEditorPanelActive}
                  queueVisualState={isQueueEditorPanelActive ? queueVisualState : null}
                  queuePreviewPrompts={queueEditorEstimate.setPrompts}
                  queuePreviewEntries={queueEditorEstimate.setPromptEntries}
                  queueCyclePreviewPrompts={queueEditorEstimate.setCyclePrompts}
                  queueCyclePreviewEntries={queueEditorEstimate.setCyclePromptEntries}
                  queueShuffleEnabled={queueEditorDraft.queueBuildSettings.shuffleEnabled}
                  queueShuffleSeed={queueEditorDraft.queueBuildSettings.shuffleSeed}
                  queueTraversalMode={queueEditorDraft.queueBuildSettings.traversalMode}
                  queuePreviewSetId={queueEditorDraft.activeSetId}
                  queueCompletionTick={isQueueEditorPanelActive ? queueCompletionTick : 0}
                  generationPreview={isQueueEditorPanelActive ? generationPreview : null}
                  generationPreviewHoldMs={generationPreviewHoldMs}
                  onChangeGenerationPreviewHoldMs={handleSetGenerationPreviewHoldMs}
                  queueSetTarget={queueEditorDraft.activeSetId}
                  editorResetTick={editorInteractionResetTick}
                  loraCatalog={loraCatalog}
                  onRefreshLoraCatalog={refreshLoraCatalog}
                  onRequestLoraInfo={requestLoraInfoThroughWebSocket}
                  modelCatalog={modelCatalog}
                  onRefreshModelCatalog={refreshModelCatalog}
                  onRequestModelInfo={requestModelInfoThroughWebSocket}
                  onChange={handleQueueEditorDocumentChange}
                  onActivePromptTypeProgress={handleActivePromptTypeProgress}
                  onChainLinkFeedback={handleChainLinkFeedback}
                  path={queueEditorDraft.sourceFile || currentFile || ''}
                  enabledCSVs={enabledCSVs}
                  globalSearchQuery={globalSearchQuery}
                  globalSearchFocusValue={globalSearchFocusValue}
                  globalSearchFocusNonce={globalSearchFocusNonce}
                  overlayMode={overlayMode}
                  mobileSelectionMode={mobileSelectionMode}
                  queueTrackerCard={isQueueEditorPanelActive ? renderQueueTrackerCard() : null}
                  onOutputPreviewSnapshotChange={() => {}}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-zinc-600 text-xs uppercase tracking-widest font-bold">
          Select or create a batch file
        </div>
      )}
    </div>
  );
}
