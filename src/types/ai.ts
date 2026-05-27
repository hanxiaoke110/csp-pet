// AI provider types
export type AIProvider = 'deepseek' | 'kimi' | 'dashscope' | 'zhipu';
export type AppMode = 'coach' | 'student' | 'ai_coach';

export interface AIConfig {
  aiProvider: AIProvider;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export const AI_MODELS: Record<string, Record<string, { name: string }>> = {
  deepseek: {
    'deepseek-chat': { name: 'DeepSeek-V3' },
    'deepseek-reasoner': { name: 'DeepSeek-R1' },
  },
  kimi: {
    'moonshot-v1-8k': { name: 'Kimi-8K' },
    'moonshot-v1-32k': { name: 'Kimi-32K' },
    'moonshot-v1-128k': { name: 'Kimi-128K' },
  },
  dashscope: {
    'qwen-plus': { name: '通义千问-Plus' },
    'qwen-max': { name: '通义千问-Max' },
    'qwen-turbo': { name: '通义千问-Turbo' },
  },
  zhipu: {
    'glm-4-flash': { name: 'GLM-4-Flash' },
    'glm-4-plus': { name: 'GLM-4-Plus' },
  },
};

export const API_ENDPOINTS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  kimi: 'https://api.moonshot.cn/v1/chat/completions',
  dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
};

export const DEFAULT_CONFIG: AIConfig = {
  aiProvider: 'deepseek',
  model: 'deepseek-chat',
  apiKey: '',
  temperature: 0.7,
  maxTokens: 2000,
};
