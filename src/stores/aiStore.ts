import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AIConfig, ChatMessage, ChatSession } from '../types/ai';
import { DEFAULT_CONFIG } from '../types/ai';

const MAX_MSGS = 20;

interface AIState {
  config: AIConfig;
  sessions: ChatSession[];
  currentSessionId: string | null;
  isStreaming: boolean;

  setConfig: (config: AIConfig) => void;
  loadConfig: () => void;
  saveConfig: () => void;

  createSession: () => string;
  setCurrentSession: (id: string) => void;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  setStreaming: (v: boolean) => void;

  getCurrentSession: () => ChatSession | null;
  getHistory: () => ChatMessage[];
  deleteSession: (id: string) => void;
  loadSessions: () => Promise<void>;
}

export const useAIStore = create<AIState>((set, get) => ({
  config: { ...DEFAULT_CONFIG },
  sessions: [],
  currentSessionId: null,
  isStreaming: false,

  setConfig: (config) => {
    set({ config });
    localStorage.setItem('csp_ai_config', JSON.stringify(config));
  },

  loadConfig: () => {
    try {
      const saved = localStorage.getItem('csp_ai_config');
      if (saved) set({ config: { ...DEFAULT_CONFIG, ...JSON.parse(saved) } });
    } catch { /* ignore */ }
  },

  saveConfig: () => {
    localStorage.setItem('csp_ai_config', JSON.stringify(get().config));
  },

  createSession: () => {
    const id = crypto.randomUUID();
    const session: ChatSession = {
      id,
      title: '新对话',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set(s => ({
      sessions: [session, ...s.sessions],
      currentSessionId: id,
    }));
    // Persist to SQLite
    invoke('create_chat_session', { title: '新对话' }).then((dbId: unknown) => {
      if (typeof dbId === 'string' && dbId !== id) {
        // Replace temp id with DB id
        set(s => ({
          sessions: s.sessions.map(sess => sess.id === id ? { ...sess, id: dbId } : sess),
          currentSessionId: s.currentSessionId === id ? dbId : s.currentSessionId,
        }));
      }
    }).catch(() => {});
    return id;
  },

  setCurrentSession: (id) => set({ currentSessionId: id }),

  addMessage: (sessionId, message) => {
    set(s => ({
      sessions: s.sessions.map(sess =>
        sess.id === sessionId
          ? {
              ...sess,
              messages: [...sess.messages, message].slice(-MAX_MSGS),
              updatedAt: new Date().toISOString(),
              title: sess.messages.length === 0 && message.role === 'user'
                ? message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '')
                : sess.title,
            }
          : sess
      ),
    }));
    // Persist to SQLite (fire-and-forget)
    invoke('add_chat_message', { sessionId, role: message.role, content: message.content }).catch(() => {});
  },

  setStreaming: (v) => set({ isStreaming: v }),

  getCurrentSession: () => {
    const { sessions, currentSessionId } = get();
    return sessions.find(s => s.id === currentSessionId) || null;
  },

  getHistory: () => {
    const session = get().getCurrentSession();
    return session?.messages || [];
  },

  deleteSession: (id) => {
    set(s => ({
      sessions: s.sessions.filter(sess => sess.id !== id),
      currentSessionId: s.currentSessionId === id ? null : s.currentSessionId,
    }));
  },

  loadSessions: async () => {
    try {
      const dbSessions = await invoke('get_chat_sessions') as { id: string; title: string; created_at: string; updated_at: string }[];
      if (!dbSessions || !dbSessions.length) return;
      const sessions: ChatSession[] = [];
      for (const s of dbSessions) {
        try {
          const msgs = await invoke('get_chat_messages', { sessionId: s.id }) as { role: string; content: string; created_at: string }[];
          sessions.push({
            id: s.id,
            title: s.title || '新对话',
            messages: (msgs || []).slice(-MAX_MSGS).map((m: any) => ({ role: m.role, content: m.content })),
            createdAt: s.created_at,
            updatedAt: s.updated_at,
          });
        } catch { sessions.push({ id: s.id, title: s.title || '新对话', messages: [], createdAt: s.created_at, updatedAt: s.updated_at }); }
      }
      if (sessions.length > 0) {
        set({ sessions, currentSessionId: sessions[0].id });
      }
    } catch { /* SQLite unavailable */ }
  },
}));
