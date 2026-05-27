import { create } from 'zustand';
import type { AIConfig, ChatMessage, ChatSession } from '../types/ai';
import { DEFAULT_CONFIG } from '../types/ai';

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
    return id;
  },

  setCurrentSession: (id) => set({ currentSessionId: id }),

  addMessage: (sessionId, message) => {
    set(s => ({
      sessions: s.sessions.map(sess =>
        sess.id === sessionId
          ? {
              ...sess,
              messages: [...sess.messages, message],
              updatedAt: new Date().toISOString(),
              title: sess.messages.length === 0 && message.role === 'user'
                ? message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '')
                : sess.title,
            }
          : sess
      ),
    }));
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
}));
