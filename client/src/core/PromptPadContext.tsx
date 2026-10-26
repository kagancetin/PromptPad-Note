import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type {
    Note,
    PromptPadClientConfig,
    ExtractedNoteData,
    OrchestrateResult,
    PromptPadSettingItem,
    ConversationHistoryItem,
    UserIntentType,
} from "promptpad-note-shared";

export interface PromptPadContextValue {
    // States
    notes: Note[];
    categories: string[];
    settings: PromptPadSettingItem[];
    isLoadingSettings: boolean;
    loading: boolean;
    isOrchestrating: boolean;
    isConfirming: boolean;
    error: string | null;
    activeCategory: string | null;
    orchestrateResult: OrchestrateResult | null;
    apiBaseUrl: string;
    page: number;
    totalPages: number;
    totalCount: number;

    // Interaction & Conversation History
    history: ConversationHistoryItem[];
    historyPage: number;
    historyTotalPages: number;
    isLoadingHistory: boolean;

    // Headless Actions
    sendPrompt: (text: string, forceIntent?: UserIntentType) => Promise<OrchestrateResult>;
    confirmNote: (preview: ExtractedNoteData, targetNoteId?: string) => Promise<Note>;
    clearOrchestration: () => void;
    fetchNotes: (filter?: { category?: string; tag?: string; search?: string; page?: number }) => Promise<void>;
    fetchCategories: () => Promise<void>;
    fetchSettings: () => Promise<void>;
    updateSetting: (key: string, value: any, description?: string) => Promise<boolean>;
    loadMoreHistory: () => Promise<void>;
    refreshHistory: () => Promise<void>;
    deleteNote: (id: string) => Promise<boolean>;
    setActiveCategory: (category: string | null) => void;
    setPage: (page: number) => void;
}

const PromptPadContext = createContext<PromptPadContextValue | null>(null);

export interface PromptPadProviderProps {
    config?: PromptPadClientConfig;
    children: ReactNode;
}

export const PromptPadProvider: React.FC<PromptPadProviderProps> = ({ config, children }) => {
    const apiBaseUrl = config?.apiBaseUrl || "/api";

    const [notes, setNotes] = useState<Note[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [settings, setSettings] = useState<PromptPadSettingItem[]>([]);
    const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);
    const [isOrchestrating, setIsOrchestrating] = useState<boolean>(false);
    const [isConfirming, setIsConfirming] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [orchestrateResult, setOrchestrateResult] = useState<OrchestrateResult | null>(null);
    const [page, setPage] = useState<number>(1);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [totalCount, setTotalCount] = useState<number>(0);

    // Interaction History
    const [history, setHistory] = useState<ConversationHistoryItem[]>([]);
    const [historyPage, setHistoryPage] = useState<number>(1);
    const [historyTotalPages, setHistoryTotalPages] = useState<number>(1);
    const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

    // 0. Fetch Categories
    const fetchCategories = useCallback(async () => {
        try {
            const res = await fetch(`${apiBaseUrl}/notes/categories`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    setCategories(json.data);
                }
            }
        } catch {
            // Silently ignore
        }
    }, [apiBaseUrl]);

    // 0.1. Fetch Settings & System Prompts
    const fetchSettings = useCallback(async () => {
        setIsLoadingSettings(true);
        try {
            const res = await fetch(`${apiBaseUrl}/notes/settings/prompts`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    setSettings(json.data);
                }
            }
        } catch (err: any) {
            console.error("Failed to load settings:", err);
        } finally {
            setIsLoadingSettings(false);
        }
    }, [apiBaseUrl]);

    // 0.2. Update Setting
    const updateSetting = useCallback(
        async (key: string, value: any, description?: string): Promise<boolean> => {
            try {
                const res = await fetch(`${apiBaseUrl}/notes/settings/prompts/${key}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ value, description }),
                });
                if (!res.ok) throw new Error(`Failed to update setting: ${res.status}`);
                const json = await res.json();
                if (json.success) {
                    setSettings((prev) =>
                        prev.map((s) => (s.key === key ? { ...s, value, ...(description ? { description } : {}) } : s))
                    );
                    return true;
                }
                return false;
            } catch (err: any) {
                console.error(`Error updating setting (${key}):`, err);
                return false;
            }
        },
        [apiBaseUrl]
    );

    // 0.3. Fetch History (Paginated)
    const fetchHistory = useCallback(
        async (targetPage = 1, append = false) => {
            setIsLoadingHistory(true);
            try {
                const res = await fetch(`${apiBaseUrl}/notes/history?page=${targetPage}&limit=5`);
                if (res.ok) {
                    const json = await res.json();
                    if (json.success && json.data) {
                        const items: ConversationHistoryItem[] = json.data.history || [];
                        setHistory((prev) => (append ? [...prev, ...items] : items));
                        setHistoryPage(json.data.page);
                        setHistoryTotalPages(json.data.totalPages);
                    }
                }
            } catch (err: any) {
                console.error("Failed to fetch history:", err);
            } finally {
                setIsLoadingHistory(false);
            }
        },
        [apiBaseUrl]
    );

    const loadMoreHistory = useCallback(async () => {
        if (historyPage < historyTotalPages && !isLoadingHistory) {
            await fetchHistory(historyPage + 1, true);
        }
    }, [historyPage, historyTotalPages, isLoadingHistory, fetchHistory]);

    const refreshHistory = useCallback(async () => {
        await fetchHistory(1, false);
    }, [fetchHistory]);

    // 1. Fetch Notes (With filtering & pagination)
    const fetchNotes = useCallback(
        async (filter?: { category?: string; tag?: string; search?: string; page?: number }) => {
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams();
                if (filter?.category) params.append("category", filter.category);
                if (filter?.tag) params.append("tag", filter.tag);
                if (filter?.search) params.append("search", filter.search);
                const targetPage = filter?.page !== undefined ? filter.page : page;
                params.append("page", String(targetPage));
                params.append("limit", "6");

                const res = await fetch(`${apiBaseUrl}/notes?${params.toString()}`);
                if (!res.ok) throw new Error(`Failed to fetch notes: ${res.status}`);

                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    setNotes(json.data);
                    if (json.totalPages !== undefined) setTotalPages(json.totalPages);
                    if (json.total !== undefined) setTotalCount(json.total);
                    if (json.page !== undefined) setPage(json.page);
                }
            } catch (err: any) {
                setError(err.message || "An error occurred.");
            } finally {
                setLoading(false);
            }
        },
        [apiBaseUrl, page]
    );

    /**
     * 2. UNIFIED ORCHESTRATOR (sendPrompt)
     */
    const sendPrompt = useCallback(
        async (text: string, forceIntent?: UserIntentType): Promise<OrchestrateResult> => {
            setIsOrchestrating(true);
            setError(null);
            try {
                const res = await fetch(`${apiBaseUrl}/notes/orchestrate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text, forceIntent }),
                });

                if (!res.ok) throw new Error(`Request failed: ${res.status}`);

                const json = await res.json();
                if (!json.success || !json.data) {
                    throw new Error(json.error || "An unexpected response was received.");
                }

                const data: OrchestrateResult = json.data;
                setOrchestrateResult(data);

                if (json.historyItem) {
                    setHistory((prev) => [json.historyItem, ...prev]);
                }

                return data;
            } catch (err: any) {
                setError(err.message || "An error occurred while processing the request.");
                throw err;
            } finally {
                setIsOrchestrating(false);
            }
        },
        [apiBaseUrl]
    );

    /**
     * 3. CONFIRM & PERSIST NOTE (confirmNote)
     */
    const confirmNote = useCallback(
        async (preview: ExtractedNoteData, targetNoteId?: string): Promise<Note> => {
            setIsConfirming(true);
            setError(null);
            try {
                const res = await fetch(`${apiBaseUrl}/notes/confirm`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ preview, targetNoteId }),
                });

                if (!res.ok) throw new Error(`Failed to save note: ${res.status}`);

                const json = await res.json();
                if (!json.success || !json.data) {
                    throw new Error(json.error || "An error occurred while saving the note.");
                }

                const savedNote: Note = json.data;
                const isMerged = !!json.isMerged;

                if (isMerged && targetNoteId) {
                    setNotes((prev) => prev.map((n) => (n.id === targetNoteId ? savedNote : n)));
                } else {
                    setNotes((prev) => [savedNote, ...prev]);
                    setTotalCount((prev) => prev + 1);
                }

                setOrchestrateResult(null);
                fetchCategories();
                return savedNote;
            } catch (err: any) {
                setError(err.message || "An error occurred while confirming the note.");
                throw err;
            } finally {
                setIsConfirming(false);
            }
        },
        [apiBaseUrl, fetchCategories]
    );

    const clearOrchestration = useCallback(() => {
        setOrchestrateResult(null);
    }, []);

    // 4. Delete Note
    const deleteNote = useCallback(
        async (id: string): Promise<boolean> => {
            try {
                const res = await fetch(`${apiBaseUrl}/notes/${id}`, { method: "DELETE" });
                if (!res.ok) throw new Error("Delete failed.");

                const json = await res.json();
                if (json.success) {
                    setNotes((prev) => prev.filter((n) => n.id !== id));
                    setTotalCount((prev) => Math.max(0, prev - 1));
                    fetchCategories();
                    return true;
                }
                return false;
            } catch (err: any) {
                setError(err.message || "Failed to delete note.");
                return false;
            }
        },
        [apiBaseUrl, fetchCategories]
    );

    useEffect(() => {
        fetchCategories();
        fetchSettings();
        fetchHistory(1, false);
    }, [fetchCategories, fetchSettings, fetchHistory]);

    useEffect(() => {
        fetchNotes(activeCategory ? { category: activeCategory } : undefined);
    }, [activeCategory, fetchNotes]);

    return (
        <PromptPadContext.Provider
            value={{
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
                apiBaseUrl,
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
                fetchCategories,
                fetchSettings,
                updateSetting,
                loadMoreHistory,
                refreshHistory,
                deleteNote,
                setActiveCategory,
                setPage,
            }}
        >
            {children}
        </PromptPadContext.Provider>
    );
};

export function usePromptPad(): PromptPadContextValue {
    const context = useContext(PromptPadContext);
    if (!context) {
        throw new Error("usePromptPad hook must be used within a PromptPadProvider.");
    }
    return context;
}
