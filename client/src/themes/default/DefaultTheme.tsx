import React, { useState, useEffect } from "react";
import { usePromptPad } from "../../core/PromptPadContext.js";
import type { ExtractedNoteData, OrchestrateDebugMeta } from "promptpad-note-shared";

export const DefaultTheme: React.FC = () => {
    const {
        notes,
        categories,
        settings,
        isLoadingSettings,
        loading,
        isOrchestrating,
        isConfirming,
        error,
        activeCategory,
        orchestrateResult,
        page,
        totalPages,
        totalCount,
        history,
        historyPage,
        historyTotalPages,
        isLoadingHistory,
        sendPrompt,
        confirmNote,
        clearOrchestration,
        fetchNotes,
        fetchSettings,
        updateSetting,
        loadMoreHistory,
        deleteNote,
        setActiveCategory,
        setPage,
    } = usePromptPad();

    const [promptText, setPromptText] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [copied, setCopied] = useState(false);
    const [previewTab, setPreviewTab] = useState<"merged" | "new">("merged");

    // Editable Note Preview State
    const [editablePreview, setEditablePreview] = useState<ExtractedNoteData | null>(null);

    // Telemetry / Debug Analysis Modal State
    const [selectedDebug, setSelectedDebug] = useState<{
        prompt?: string;
        debug?: OrchestrateDebugMeta;
    } | null>(null);

    // History Section Expanded/Collapsed State
    const [isHistoryExpanded, setIsHistoryExpanded] = useState<boolean>(true);

    // Modal State and Setting Edit Form
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settingsTab, setSettingsTab] = useState<"general" | "prompts">("general");
    const [formValues, setFormValues] = useState<Record<string, any>>({});
    const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});
    const [savedSuccessKeys, setSavedSuccessKeys] = useState<Record<string, boolean>>({});

    // Synchronize editable state when preview arrives or tab changes
    useEffect(() => {
        if (orchestrateResult && orchestrateResult.type === "note_preview") {
            const initial =
                orchestrateResult.mergeCandidate && previewTab === "merged"
                    ? orchestrateResult.mergeCandidate.mergedPreview
                    : orchestrateResult.preview;
            setEditablePreview(JSON.parse(JSON.stringify(initial)));
        } else {
            setEditablePreview(null);
        }
    }, [orchestrateResult, previewTab]);

    // Dynamic Categories
    const distinctCategories = Array.from(
        new Set([...categories, ...notes.map((n) => n.category)])
    ).filter(Boolean);
    const categoryList = ["All", ...distinctCategories];

    // On Submit Prompt
    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!promptText.trim() || isOrchestrating) return;
        try {
            await sendPrompt(promptText.trim());
            setPromptText("");
            setPreviewTab("merged");
        } catch {
            // Error is handled by context
        }
    };

    // Copy Prompt
    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Synchronize form values when Settings modal opens
    const handleOpenSettings = () => {
        const initialMap: Record<string, any> = {};
        settings.forEach((s) => {
            initialMap[s.key] = s.value;
        });
        setFormValues(initialMap);
        setIsSettingsOpen(true);
        fetchSettings();
    };

    // Save single setting
    const handleSaveSetting = async (key: string) => {
        const val = formValues[key];
        setSavingKeys((prev) => ({ ...prev, [key]: true }));
        try {
            const ok = await updateSetting(key, val);
            if (ok) {
                setSavedSuccessKeys((prev) => ({ ...prev, [key]: true }));
                setTimeout(() => {
                    setSavedSuccessKeys((prev) => ({ ...prev, [key]: false }));
                }, 2000);
            }
        } finally {
            setSavingKeys((prev) => ({ ...prev, [key]: false }));
        }
    };

    // Setting Groups
    const generalSettingKeys = [
        "output_language",
        "enable_debug_logging",
        "rag_min_similarity",
        "rag_merge_similarity",
        "rag_max_notes",
    ];
    const promptSettingKeys = [
        "classifier_prompt",
        "note_extractor_prompt",
        "note_merger_prompt",
        "prompt_enhancer_prompt",
        "qa_assistant_prompt",
    ];

    return (
        <div className="w-full max-w-4xl mx-auto space-y-6 text-slate-100 font-sans py-4 px-2 sm:px-0">
            {/* TOP HEADER AND SETTINGS BUTTON */}
            <div className="flex items-center justify-between px-1">
                <div>
                    <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                        <span>✦ PromptPad</span>
                        <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            AI Note & Prompt
                        </span>
                    </h1>
                </div>
                <button
                    onClick={handleOpenSettings}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 active:scale-95 transition cursor-pointer shadow-sm"
                >
                    <span>⚙️</span>
                    <span>Settings & Prompts</span>
                </button>
            </div>

            {/* SECTION 1: PROMPT INPUT & SEND BUTTON */}
            <form onSubmit={handleSubmit} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <textarea
                    rows={3}
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                            e.preventDefault();
                            handleSubmit();
                        }
                    }}
                    placeholder="Write a note, ask a question, or enter a draft prompt (e.g., 'Watched Inception and Interstellar' or 'What movies did I watch?' or 'Write a good SEO prompt for blog posts')..."
                    className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl p-3.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition resize-none"
                />

                <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500 hidden sm:inline">
                        💡 Automatically detects your intent (Note capture/merge, Q&A, Note update, Prompt enhancement, or Clarification)
                    </span>
                    <button
                        type="submit"
                        disabled={isOrchestrating || !promptText.trim()}
                        className="w-full sm:w-auto px-7 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 active:scale-95 shadow-md shadow-indigo-600/30 transition disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
                    >
                        {isOrchestrating ? (
                            <>
                                <span className="animate-spin text-sm">✦</span>
                                <span>Processing...</span>
                            </>
                        ) : (
                            <>
                                <span>Send</span>
                                <span>→</span>
                            </>
                        )}
                    </button>
                </div>
            </form>

            {/* SECTION 2: DYNAMIC ORCHESTRATION CARD */}
            {orchestrateResult && (
                <div className="animate-fade-in relative">
                    {/* A) NOTE PREVIEW & UPSERT */}
                    {orchestrateResult.type === "note_preview" && editablePreview && (
                        <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-2xl p-5 shadow-2xl space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                                <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                                    <span className="text-base">
                                        {orchestrateResult.isUpdateOnly ? "✏️" : "📝"}
                                    </span>
                                    <span>
                                        {orchestrateResult.isUpdateOnly
                                            ? "Edit Note (Update Existing Note)"
                                            : orchestrateResult.mergeCandidate
                                            ? "Smart Note Suggestion (Matched Existing Note!)"
                                            : "Note Preview (You can edit any field)"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {orchestrateResult.debug && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSelectedDebug({
                                                    prompt: promptText || "Last Request",
                                                    debug: orchestrateResult.debug,
                                                })
                                            }
                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 text-[11px] font-semibold transition cursor-pointer"
                                            title="Inspect model analysis and similarity scores"
                                        >
                                            <span>ℹ️</span>
                                            <span>Analysis & Log</span>
                                        </button>
                                    )}
                                    <button
                                        onClick={clearOrchestration}
                                        className="text-slate-400 hover:text-slate-200 text-sm cursor-pointer"
                                        title="Close"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            {/* MERGE / UPDATE CANDIDATE INFO */}
                            {orchestrateResult.mergeCandidate && (
                                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2.5">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                        <span className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
                                            <span>💡</span>
                                            <span>
                                                {orchestrateResult.isUpdateOnly
                                                    ? "Existing note to be updated:"
                                                    : "High similarity found with existing note:"}
                                            </span>
                                            <strong className="text-amber-200 underline">
                                                "{orchestrateResult.mergeCandidate.existingNoteTitle}"
                                            </strong>
                                        </span>
                                        {!orchestrateResult.isUpdateOnly && (
                                            <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewTab("merged")}
                                                    className={`px-2.5 py-1 rounded-md transition cursor-pointer font-medium ${
                                                        previewTab === "merged"
                                                            ? "bg-amber-600 text-white shadow-sm"
                                                            : "text-slate-400 hover:text-slate-200"
                                                    }`}
                                                >
                                                    🔄 Merged View
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewTab("new")}
                                                    className={`px-2.5 py-1 rounded-md transition cursor-pointer font-medium ${
                                                        previewTab === "new"
                                                            ? "bg-emerald-600 text-white shadow-sm"
                                                            : "text-slate-400 hover:text-slate-200"
                                                    }`}
                                                >
                                                    ➕ New Input Only
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* INLINE EDITABLE INPUTS */}
                            <div className="space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <div className="sm:col-span-2">
                                        <label className="text-[11px] text-slate-400 font-semibold block mb-1">
                                            Title:
                                        </label>
                                        <input
                                            type="text"
                                            value={editablePreview.title}
                                            onChange={(e) =>
                                                setEditablePreview((prev) =>
                                                    prev ? { ...prev, title: e.target.value } : null
                                                )
                                            }
                                            className="w-full font-bold text-sm text-slate-100 bg-slate-950/80 border border-slate-700/80 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 transition"
                                            placeholder="Enter title..."
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[11px] text-slate-400 font-semibold block mb-1">
                                            Category:
                                        </label>
                                        <input
                                            type="text"
                                            value={editablePreview.category}
                                            onChange={(e) =>
                                                setEditablePreview((prev) =>
                                                    prev ? { ...prev, category: e.target.value } : null
                                                )
                                            }
                                            className="w-full text-xs font-semibold text-emerald-300 bg-slate-950/80 border border-slate-700/80 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 transition"
                                            placeholder="Category (e.g. Movies)"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[11px] text-slate-400 font-semibold block mb-1">
                                        Content:
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={editablePreview.content}
                                        onChange={(e) =>
                                            setEditablePreview((prev) =>
                                                prev ? { ...prev, content: e.target.value } : null
                                            )
                                        }
                                        className="w-full text-sm text-slate-200 bg-slate-950/80 p-3 rounded-xl border border-slate-700/80 leading-relaxed focus:outline-none focus:border-emerald-500 transition resize-y"
                                        placeholder="Note content..."
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[11px] text-slate-400 font-semibold block mb-1">
                                            Date (Calculated / Specified):
                                        </label>
                                        <input
                                            type="text"
                                            value={editablePreview.extractedDate || ""}
                                            onChange={(e) =>
                                                setEditablePreview((prev) =>
                                                    prev
                                                        ? {
                                                              ...prev,
                                                              extractedDate: e.target.value || null,
                                                          }
                                                        : null
                                                )
                                            }
                                            className="w-full text-xs text-amber-300 bg-slate-950/80 border border-slate-700/80 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-400 transition"
                                            placeholder="No date (e.g. 10/05/2026 Monday)"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[11px] text-slate-400 font-semibold block mb-1">
                                            Tags (Comma-separated):
                                        </label>
                                        <input
                                            type="text"
                                            value={(editablePreview.tags || []).join(", ")}
                                            onChange={(e) =>
                                                setEditablePreview((prev) =>
                                                    prev
                                                        ? {
                                                              ...prev,
                                                              tags: e.target.value
                                                                  .split(",")
                                                                  .map((t) => t.trim().toLowerCase())
                                                                  .filter(Boolean),
                                                          }
                                                        : null
                                                )
                                            }
                                            className="w-full text-xs text-slate-300 bg-slate-950/80 border border-slate-700/80 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 transition"
                                            placeholder="movies, scifi, favorites"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-800">
                                <button
                                    type="button"
                                    onClick={clearOrchestration}
                                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
                                >
                                    Cancel
                                </button>

                                {orchestrateResult.mergeCandidate ? (
                                    <>
                                        {!orchestrateResult.isUpdateOnly && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    confirmNote(
                                                        editablePreview ||
                                                            (orchestrateResult.preview as ExtractedNoteData)
                                                    )
                                                }
                                                disabled={isConfirming}
                                                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 active:scale-95 transition disabled:opacity-40 cursor-pointer"
                                                title="Saves as a separate new note without modifying the existing one"
                                            >
                                                ➕ Save as Separate New Note
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() =>
                                                confirmNote(
                                                    editablePreview ||
                                                        orchestrateResult.mergeCandidate!.mergedPreview,
                                                    orchestrateResult.mergeCandidate!.existingNoteId
                                                )
                                            }
                                            disabled={isConfirming}
                                            className="px-5 py-2 rounded-xl text-xs font-semibold bg-amber-600 text-white hover:bg-amber-500 active:scale-95 shadow-md shadow-amber-600/30 transition disabled:opacity-40 cursor-pointer flex items-center gap-2"
                                            title="Updates the existing note with this information"
                                        >
                                            {isConfirming
                                                ? "⏳ Updating..."
                                                : orchestrateResult.isUpdateOnly
                                                ? "💾 Update & Save Note"
                                                : "🔄 Merge with Existing Note (Update)"}
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            confirmNote(
                                                editablePreview ||
                                                    (orchestrateResult.preview as ExtractedNoteData)
                                            )
                                        }
                                        disabled={isConfirming}
                                        className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95 shadow-md shadow-emerald-600/30 transition disabled:opacity-40 cursor-pointer flex items-center gap-2"
                                    >
                                        {isConfirming ? "⏳ Saving..." : "💾 Confirm & Save"}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* B) QUESTION - ANSWER (RAG Notes Search) */}
                    {orchestrateResult.type === "question_answer" && (
                        <div className="bg-gradient-to-r from-violet-950/40 to-indigo-950/40 border border-indigo-500/30 rounded-2xl p-5 shadow-lg relative space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-indigo-500/20">
                                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400">
                                    <span>✦ Response from Notes Memory</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {orchestrateResult.debug && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSelectedDebug({
                                                    prompt: promptText || "Last Request",
                                                    debug: orchestrateResult.debug,
                                                })
                                            }
                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 text-[11px] font-semibold transition cursor-pointer"
                                            title="Inspect scanned notes and similarity scores"
                                        >
                                            <span>ℹ️</span>
                                            <span>Analysis & Log</span>
                                        </button>
                                    )}
                                    <button
                                        onClick={clearOrchestration}
                                        className="text-slate-400 hover:text-slate-200 text-sm cursor-pointer"
                                        title="Close"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                            <p className="text-sm text-slate-200 leading-relaxed font-medium whitespace-pre-wrap">
                                {orchestrateResult.answer}
                            </p>
                            {orchestrateResult.relevantNotes.length > 0 && (
                                <div className="pt-2 border-t border-indigo-500/20 flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] text-slate-400">Referenced Notes:</span>
                                    {orchestrateResult.relevantNotes.map((rn) => (
                                        <span
                                            key={rn.id}
                                            className="px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px]"
                                        >
                                            📌 {rn.title} {rn.extractedDate ? `(${rn.extractedDate})` : ""}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* C) PROMPT ENHANCEMENT (Prompt Engineering) */}
                    {orchestrateResult.type === "prompt_preview" && (
                        <div className="bg-slate-900 border-2 border-amber-500/40 rounded-2xl p-5 shadow-2xl space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                                <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                                    <span>⚡ Enhanced Professional Prompt</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {orchestrateResult.debug && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSelectedDebug({
                                                    prompt: promptText || "Last Request",
                                                    debug: orchestrateResult.debug,
                                                })
                                            }
                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 text-[11px] font-semibold transition cursor-pointer"
                                            title="Inspect request analysis"
                                        >
                                            <span>ℹ️</span>
                                            <span>Analysis & Log</span>
                                        </button>
                                    )}
                                    <button
                                        onClick={clearOrchestration}
                                        className="text-slate-400 hover:text-slate-200 text-sm cursor-pointer"
                                        title="Close"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <span className="text-[11px] text-slate-500 uppercase font-semibold">Original Draft:</span>
                                <p className="text-xs text-slate-400 italic bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60">
                                    "{orchestrateResult.preview.original}"
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <span className="text-[11px] text-amber-400/90 uppercase font-semibold">Enhanced Version:</span>
                                <pre className="text-xs text-slate-200 bg-slate-950 p-3.5 rounded-xl border border-amber-500/20 whitespace-pre-wrap font-mono leading-relaxed">
                                    {orchestrateResult.preview.enhanced}
                                </pre>
                            </div>

                            <div className="flex justify-end pt-2">
                                <button
                                    onClick={() => handleCopy(orchestrateResult.preview.enhanced)}
                                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 active:scale-95 transition cursor-pointer flex items-center gap-1.5"
                                >
                                    {copied ? "✓ Copied!" : "📋 Copy Prompt"}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* D) AMBIGUITY & CLARIFICATION */}
                    {orchestrateResult.type === "clarify" && (
                        <div className="bg-slate-900 border border-purple-500/40 rounded-2xl p-5 shadow-lg relative space-y-4">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                                <div className="flex items-center gap-2 text-xs font-semibold text-purple-400">
                                    <span>🤔 Clarify Intent</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {orchestrateResult.debug && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSelectedDebug({
                                                    prompt: promptText || "Last Request",
                                                    debug: orchestrateResult.debug,
                                                })
                                            }
                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 hover:bg-purple-500/20 text-[11px] font-semibold transition cursor-pointer"
                                            title="Inspect request analysis"
                                        >
                                            <span>ℹ️</span>
                                            <span>Analysis & Log</span>
                                        </button>
                                    )}
                                    <button
                                        onClick={clearOrchestration}
                                        className="text-slate-400 hover:text-slate-200 text-sm cursor-pointer"
                                        title="Close"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <p className="text-sm text-slate-200 leading-relaxed font-medium">
                                    {orchestrateResult.message}
                                </p>
                                <p className="text-xs text-slate-400 italic bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                                    "{orchestrateResult.originalText}"
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5 pt-1">
                                <button
                                    onClick={() => sendPrompt(orchestrateResult.originalText, "note")}
                                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95 transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                                >
                                    <span>📝</span>
                                    <span>Save as New Note</span>
                                </button>
                                <button
                                    onClick={() => sendPrompt(orchestrateResult.originalText, "question")}
                                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                                >
                                    <span>🔍</span>
                                    <span>Search in Notes</span>
                                </button>
                                <button
                                    onClick={clearOrchestration}
                                    className="px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition cursor-pointer"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* E) GENERAL CHAT (Legacy fallback) */}
                    {orchestrateResult.type === "chat" && (
                        <div className="bg-slate-900 border border-sky-500/30 rounded-2xl p-5 shadow-lg relative space-y-2">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                                <div className="flex items-center gap-2 text-xs font-semibold text-sky-400">
                                    <span>💬 Assistant Chat</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {orchestrateResult.debug && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSelectedDebug({
                                                    prompt: promptText || "Last Request",
                                                    debug: orchestrateResult.debug,
                                                })
                                            }
                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300 hover:bg-sky-500/20 text-[11px] font-semibold transition cursor-pointer"
                                            title="Inspect request analysis"
                                        >
                                            <span>ℹ️</span>
                                            <span>Analysis & Log</span>
                                        </button>
                                    )}
                                    <button
                                        onClick={clearOrchestration}
                                        className="text-slate-400 hover:text-slate-200 text-sm cursor-pointer"
                                        title="Close"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                            <p className="text-sm text-slate-200 leading-relaxed font-normal whitespace-pre-wrap">
                                {orchestrateResult.reply}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center">
                    {error}
                </div>
            )}

            {/* SECTION 2.5: CONVERSATION HISTORY & LOGS */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
                <div
                    className="flex items-center justify-between cursor-pointer select-none"
                    onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                >
                    <div className="flex items-center gap-2">
                        <span className="text-sm">💬</span>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                            Request & Interaction History
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 border border-slate-700/60 text-slate-400 font-mono">
                            {history.length}
                        </span>
                    </div>
                    <button
                        type="button"
                        className="text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
                    >
                        {isHistoryExpanded ? "▲ Hide" : "▼ Show"}
                    </button>
                </div>

                {isHistoryExpanded && (
                    <div className="space-y-3 pt-1">
                        {history.length === 0 ? (
                            <div className="text-center py-4 text-xs text-slate-500">
                                No request or conversation history recorded yet.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {history.map((item) => {
                                    const intentBadges: Record<string, { label: string; color: string }> = {
                                        note: {
                                            label: "📝 Note Capture",
                                            color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
                                        },
                                        question: {
                                            label: "❓ Question (RAG)",
                                            color: "bg-indigo-500/10 border-indigo-500/30 text-indigo-300",
                                        },
                                        note_update: {
                                            label: "✏️ Note Update",
                                            color: "bg-teal-500/10 border-teal-500/30 text-teal-300",
                                        },
                                        prompt_enhance: {
                                            label: "⚡ Prompt Enhance",
                                            color: "bg-amber-500/10 border-amber-500/30 text-amber-300",
                                        },
                                        clarify: {
                                            label: "🤔 Clarification",
                                            color: "bg-purple-500/10 border-purple-500/30 text-purple-300",
                                        },
                                        chat: {
                                            label: "💬 Chat",
                                            color: "bg-sky-500/10 border-sky-500/30 text-sky-300",
                                        },
                                    };
                                    const badge = intentBadges[item.intent] || {
                                        label: item.intent,
                                        color: "bg-slate-800 text-slate-300",
                                    };

                                    return (
                                        <div
                                            key={item.id}
                                            className="bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 rounded-xl p-3 space-y-1.5 text-xs transition"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span
                                                        className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold ${badge.color}`}
                                                    >
                                                        {badge.label}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                        {new Date(item.createdAt).toLocaleTimeString([], {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        })}
                                                    </span>
                                                </div>
                                                {item.debug && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setSelectedDebug({
                                                                prompt: item.prompt,
                                                                debug: item.debug,
                                                            })
                                                        }
                                                        className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 hover:border-indigo-500/50 text-slate-300 hover:text-indigo-300 text-[10px] font-medium transition cursor-pointer"
                                                        title="Inspect score and threshold analysis for this request"
                                                    >
                                                        <span>ℹ️ Analysis</span>
                                                        {item.debug.latencyMs !== undefined && (
                                                            <span className="text-slate-500 text-[9px] font-mono">
                                                                ({item.debug.latencyMs}ms)
                                                            </span>
                                                        )}
                                                    </button>
                                                )}
                                            </div>

                                            <div className="space-y-1">
                                                <p className="text-slate-200 font-medium">"{item.prompt}"</p>
                                                <div className="text-slate-400 text-[11px] line-clamp-2 bg-slate-900/40 p-2 rounded-lg border border-slate-800/40">
                                                    {item.result.type === "question_answer" && item.result.answer}
                                                    {item.result.type === "clarify" && item.result.message}
                                                    {item.result.type === "chat" && item.result.reply}
                                                    {item.result.type === "note_preview" && (
                                                        <span>
                                                            <strong>{item.result.preview.title}:</strong>{" "}
                                                            {item.result.preview.content}
                                                        </span>
                                                    )}
                                                    {item.result.type === "prompt_preview" && (
                                                        <span>{item.result.preview.enhanced}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* LAZY LOAD BUTTON */}
                                {historyPage < historyTotalPages && (
                                    <div className="text-center pt-2">
                                        <button
                                            type="button"
                                            onClick={loadMoreHistory}
                                            disabled={isLoadingHistory}
                                            className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 transition cursor-pointer disabled:opacity-40"
                                        >
                                            {isLoadingHistory
                                                ? "⏳ Loading..."
                                                : "Load More History (Lazy Load)"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* SECTION 3: DYNAMIC FILTERS & CATEGORIES */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                    {categoryList.map((cat) => {
                        const isSelected =
                            cat === "All" ? activeCategory === null : activeCategory === cat;
                        return (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat === "All" ? null : cat)}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
                                    isSelected
                                        ? "bg-indigo-600 text-white shadow-sm"
                                        : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                {cat}
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <input
                        type="text"
                        placeholder="Search notes..."
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            fetchNotes({ search: e.target.value, category: activeCategory || undefined });
                        }}
                        className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                        Total {totalCount} {totalCount === 1 ? "Note" : "Notes"}
                    </span>
                </div>
            </div>

            {/* SECTION 4: NOTES LIST (CARDS GRID) */}
            <div className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    My Notes
                </h2>

                {loading && notes.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs">Loading...</div>
                ) : notes.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs space-y-1">
                        <p>No notes recorded yet.</p>
                        <p className="text-[11px] text-slate-600">
                            Write something in the input above and press "Send"!
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {notes.map((note) => (
                            <div
                                key={note.id}
                                className="bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-4 flex flex-col justify-between space-y-3 transition shadow-sm"
                            >
                                <div className="space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="font-semibold text-sm text-slate-200 line-clamp-1">
                                            {note.title}
                                        </h3>
                                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-indigo-300 border border-slate-700 whitespace-nowrap">
                                            {note.category}
                                        </span>
                                    </div>

                                    <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                                        {note.content}
                                    </p>

                                    {note.extractedDate && (
                                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px]">
                                            📅 {note.extractedDate}
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px]">
                                    <div className="flex flex-wrap gap-1">
                                        {note.tags?.map((t) => (
                                            <span key={t} className="text-slate-500 text-[10px]">
                                                #{t}
                                            </span>
                                        ))}
                                    </div>

                                    <button
                                        onClick={() => deleteNote(note.id)}
                                        className="text-slate-500 hover:text-rose-400 transition cursor-pointer text-xs"
                                        title="Delete Note"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* SECTION 5: PAGINATION */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-4 border-t border-slate-800/80">
                    <button
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page <= 1}
                        className="px-3 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition cursor-pointer"
                    >
                        ← Previous
                    </button>

                    <span className="text-xs text-slate-400">
                        Page <span className="text-slate-200 font-bold">{page}</span> / {totalPages}
                    </span>

                    <button
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page >= totalPages}
                        className="px-3 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition cursor-pointer"
                    >
                        Next →
                    </button>
                </div>
            )}

            {/* SECTION 6: SETTINGS & SYSTEM PROMPTS MODAL */}
            {isSettingsOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm animate-fade-in">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
                            <div className="flex items-center gap-2.5">
                                <span className="text-lg">⚙️</span>
                                <div>
                                    <h2 className="font-bold text-sm text-slate-100">
                                        System Prompts & AI Settings
                                    </h2>
                                    <p className="text-[11px] text-slate-400">
                                        Update all system prompts and threshold values in real-time.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsSettingsOpen(false)}
                                className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center transition cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Tabs */}
                        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 gap-2 pt-2">
                            <button
                                onClick={() => setSettingsTab("general")}
                                className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition cursor-pointer ${
                                    settingsTab === "general"
                                        ? "bg-slate-900 text-indigo-400 border-t border-x border-slate-800"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                🌐 General Settings & Language
                            </button>
                            <button
                                onClick={() => setSettingsTab("prompts")}
                                className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition cursor-pointer ${
                                    settingsTab === "prompts"
                                        ? "bg-slate-900 text-indigo-400 border-t border-x border-slate-800"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                🧠 System Prompts ({promptSettingKeys.length})
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
                            {isLoadingSettings && (
                                <div className="text-center py-8 text-slate-500">Loading settings...</div>
                            )}

                            {/* TAB 1: GENERAL SETTINGS */}
                            {settingsTab === "general" && !isLoadingSettings && (
                                <div className="space-y-4">
                                    {generalSettingKeys.map((key) => {
                                        const currentSetting = settings.find((s) => s.key === key);
                                        const val = formValues[key] ?? currentSetting?.value ?? "";
                                        const isSaving = savingKeys[key];
                                        const isSaved = savedSuccessKeys[key];

                                        return (
                                            <div
                                                key={key}
                                                className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80 space-y-2"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <span className="font-bold text-slate-200 font-mono text-[11px]">
                                                            {key}
                                                        </span>
                                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                                            {currentSetting?.description}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleSaveSetting(key)}
                                                        disabled={isSaving}
                                                        className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition cursor-pointer ${
                                                            isSaved
                                                                ? "bg-emerald-600 text-white"
                                                                : "bg-indigo-600 hover:bg-indigo-500 text-white"
                                                        }`}
                                                    >
                                                        {isSaving ? "⏳" : isSaved ? "✓ Saved" : "Save"}
                                                    </button>
                                                </div>

                                                {key === "output_language" ? (
                                                    <div className="space-y-2 pt-1">
                                                        <input
                                                            type="text"
                                                            value={val}
                                                            onChange={(e) =>
                                                                setFormValues((prev) => ({
                                                                    ...prev,
                                                                    [key]: e.target.value,
                                                                }))
                                                            }
                                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                                                            placeholder="e.g. English, Turkish, German, Spanish..."
                                                        />
                                                        <div className="flex gap-1.5">
                                                            {["English", "Turkish", "German", "Spanish"].map(
                                                                (lang) => (
                                                                    <button
                                                                        key={lang}
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setFormValues((prev) => ({
                                                                                ...prev,
                                                                                [key]: lang,
                                                                            }))
                                                                        }
                                                                        className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                                                                    >
                                                                        {lang}
                                                                    </button>
                                                                )
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : key === "enable_debug_logging" ? (
                                                    <div className="flex items-center gap-2 pt-1">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setFormValues((prev) => ({
                                                                    ...prev,
                                                                    [key]: true,
                                                                }))
                                                            }
                                                            className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition cursor-pointer ${
                                                                val === true || val === "true"
                                                                    ? "bg-emerald-600 text-white shadow-sm"
                                                                    : "bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-200"
                                                            }`}
                                                        >
                                                            ✓ Enabled (True)
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setFormValues((prev) => ({
                                                                    ...prev,
                                                                    [key]: false,
                                                                }))
                                                            }
                                                            className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition cursor-pointer ${
                                                                val === false || val === "false"
                                                                    ? "bg-rose-600 text-white shadow-sm"
                                                                    : "bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-200"
                                                            }`}
                                                        >
                                                            ✕ Disabled (False)
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <input
                                                        type="number"
                                                        step={key.includes("similarity") ? "0.05" : "1"}
                                                        value={val}
                                                        onChange={(e) =>
                                                            setFormValues((prev) => ({
                                                                ...prev,
                                                                [key]: Number(e.target.value),
                                                            }))
                                                        }
                                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* TAB 2: SYSTEM PROMPTS */}
                            {settingsTab === "prompts" && !isLoadingSettings && (
                                <div className="space-y-4">
                                    {promptSettingKeys.map((key) => {
                                        const currentSetting = settings.find((s) => s.key === key);
                                        const val = formValues[key] ?? currentSetting?.value ?? "";
                                        const isSaving = savingKeys[key];
                                        const isSaved = savedSuccessKeys[key];

                                        return (
                                            <div
                                                key={key}
                                                className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80 space-y-2"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <span className="font-bold text-slate-200 font-mono text-[11px]">
                                                            {key}
                                                        </span>
                                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                                            {currentSetting?.description}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleSaveSetting(key)}
                                                        disabled={isSaving}
                                                        className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition cursor-pointer ${
                                                            isSaved
                                                                ? "bg-emerald-600 text-white"
                                                                : "bg-indigo-600 hover:bg-indigo-500 text-white"
                                                        }`}
                                                    >
                                                        {isSaving ? "⏳" : isSaved ? "✓ Saved" : "Save"}
                                                    </button>
                                                </div>

                                                <textarea
                                                    rows={4}
                                                    value={val}
                                                    onChange={(e) =>
                                                        setFormValues((prev) => ({
                                                            ...prev,
                                                            [key]: e.target.value,
                                                        }))
                                                    }
                                                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-3 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500 transition leading-relaxed resize-y"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
                            <span className="text-[11px] text-slate-500">
                                💡 Changes are saved to the database and will take effect on the next operation.
                            </span>
                            <button
                                onClick={() => setIsSettingsOpen(false)}
                                className="px-5 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TELEMETRY & DEBUG MODAL */}
            {selectedDebug && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
                            <div className="flex items-center gap-2">
                                <span className="text-base">ℹ️</span>
                                <h3 className="font-bold text-sm text-white">Request Analysis & Telemetry Report</h3>
                            </div>
                            <button
                                onClick={() => setSelectedDebug(null)}
                                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto space-y-4 text-xs">
                            {/* Request Prompt */}
                            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                                        Request Prompt
                                    </span>
                                    {selectedDebug.debug && (
                                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-mono text-[10px]">
                                            ⏱️ {selectedDebug.debug.latencyMs} ms
                                        </span>
                                    )}
                                </div>
                                <p className="text-slate-200 font-medium text-sm">"{selectedDebug.prompt}"</p>
                            </div>

                            {selectedDebug.debug ? (
                                <>
                                    {/* Intent and Thresholds */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 space-y-1">
                                            <span className="text-[10px] text-slate-400 uppercase font-bold">
                                                Detected Intent
                                            </span>
                                            <div className="text-sm font-semibold text-indigo-400 capitalize">
                                                {selectedDebug.debug.intent}
                                            </div>
                                        </div>
                                        <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 space-y-1">
                                            <span className="text-[10px] text-slate-400 uppercase font-bold">
                                                Active System Thresholds
                                            </span>
                                            <div className="text-[11px] text-slate-300 font-mono">
                                                RAG Min:{" "}
                                                <strong className="text-indigo-300">
                                                    {selectedDebug.debug.thresholds.ragMinSimilarity}
                                                </strong>{" "}
                                                | Merge:{" "}
                                                <strong className="text-amber-300">
                                                    {selectedDebug.debug.thresholds.ragMergeSimilarity}
                                                </strong>
                                            </div>
                                        </div>
                                    </div>

                                    {/* AI Intent Explanation */}
                                    {selectedDebug.debug.intentExplanation && (
                                        <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 space-y-1">
                                            <span className="text-[10px] text-slate-400 uppercase font-bold">
                                                Decision Rationale
                                            </span>
                                            <p className="text-slate-300 leading-relaxed">
                                                {selectedDebug.debug.intentExplanation}
                                            </p>
                                        </div>
                                    )}

                                    {/* Scanned Candidate Notes & Similarity Scores */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] text-slate-400 uppercase font-bold">
                                                Scanned Notes & Cosine Similarity Scores
                                            </span>
                                            <span className="text-[10px] text-slate-500 font-mono">
                                                {selectedDebug.debug.candidateScores?.length || 0} Candidates Evaluated
                                            </span>
                                        </div>

                                        {selectedDebug.debug.candidateScores &&
                                        selectedDebug.debug.candidateScores.length > 0 ? (
                                            <div className="space-y-1.5">
                                                {selectedDebug.debug.candidateScores.map((c, i) => (
                                                    <div
                                                        key={c.id || i}
                                                        className={`p-2.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                                                            c.passedThreshold
                                                                ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-200"
                                                                : "bg-slate-950/40 border-slate-800 text-slate-400"
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="font-mono text-[10px] opacity-60">
                                                                #{i + 1}
                                                            </span>
                                                            <span className="font-medium truncate text-slate-200">
                                                                {c.title}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                                            <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-200">
                                                                {(c.similarity * 100).toFixed(1)}% ({c.similarity})
                                                            </span>
                                                            {c.passedThreshold ? (
                                                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold">
                                                                    ✓ Passed Threshold
                                                                </span>
                                                            ) : (
                                                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-500">
                                                                    ✕ Below Threshold
                                                                </span>
                                                            )}
                                                            {c.criticApproved !== undefined && (
                                                                <span
                                                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                                                        c.criticApproved
                                                                            ? "bg-amber-500/20 text-amber-300"
                                                                            : "bg-rose-500/20 text-rose-300"
                                                                    }`}
                                                                >
                                                                    {c.criticApproved
                                                                        ? "✓ Critic Approved"
                                                                        : "✕ Critic Rejected"}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800/60 text-slate-500 text-center">
                                                Semantic database scan was not required for this request type.
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-6 text-slate-500">
                                    No telemetry/log record available for this operation.
                                </div>
                            )}
                        </div>

                        <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex justify-end">
                            <button
                                onClick={() => setSelectedDebug(null)}
                                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};