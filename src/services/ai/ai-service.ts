import type { AIConfig, ChatMessage, AppMode } from '../../types/ai';
import { DEFAULT_CONFIG, API_ENDPOINTS, AI_MODELS } from '../../types/ai';
import AIProvider from './ai-provider';

// Prompt imports — mirrored from shared/core/config.js
import { COACH_PROMPT, STUDENT_PROMPT, AI_COACH_PROMPT } from './prompts';

export { COACH_PROMPT, STUDENT_PROMPT, AI_COACH_PROMPT };

export default class AIService {
  private provider: AIProvider | null = null;
  config: AIConfig = { ...DEFAULT_CONFIG };

  constructor() {
    this.loadConfig();
  }

  loadConfig() {
    try {
      const saved = localStorage.getItem('csp_ai_config');
      if (saved) {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
        this.createProvider();
      }
    } catch { /* ignore */ }
  }

  saveConfig() {
    localStorage.setItem('csp_ai_config', JSON.stringify(this.config));
    this.createProvider();
  }

  private createProvider() {
    const { aiProvider, apiKey, model } = this.config;
    if (!apiKey) { this.provider = null; return; }
    const providerModels = AI_MODELS[aiProvider];
    const modelId = model && providerModels?.[model] ? model : Object.keys(providerModels || {})[0];
    if (!modelId) { this.provider = null; return; }
    this.provider = new AIProvider({
      apiKey,
      model: modelId,
      endpoint: API_ENDPOINTS[aiProvider],
    });
  }

  isConfigured(): boolean {
    return this.provider !== null && !!this.config.apiKey;
  }

  async ensureConfigured(): Promise<void> {
    this.loadConfig();
    if (!this.isConfigured()) throw new Error('请先在设置中配置 API Key');
  }

  private buildSystemPrompt(mode: AppMode): string {
    if (mode === 'coach') return COACH_PROMPT;
    if (mode === 'ai_coach') return AI_COACH_PROMPT;
    return STUDENT_PROMPT;
  }

  async sendMessage(content: string, mode: AppMode, history: ChatMessage[] = []): Promise<string> {
    await this.ensureConfigured();
    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(mode) },
      ...history.slice(-20),
    ];
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user' || last.content !== content) {
      messages.push({ role: 'user', content });
    }
    if (!this.provider) throw new Error('Provider not initialized');
    return this.provider.chat(messages);
  }

  async streamMessage(
    content: string,
    mode: AppMode,
    history: ChatMessage[],
    onChunk: (chunk: string, fullContent: string) => void
  ): Promise<string> {
    await this.ensureConfigured();
    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(mode) },
      ...history.slice(-20),
    ];
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user' || last.content !== content) {
      messages.push({ role: 'user', content });
    }
    if (!this.provider) throw new Error('Provider not initialized');
    return this.provider.stream(messages, onChunk);
  }
}
