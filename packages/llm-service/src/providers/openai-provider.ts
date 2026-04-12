/**
 * OpenAI 兼容 LLM Provider
 * 支持 OpenAI、通义千问（Qwen）、以及任何 OpenAI 兼容 API
 */
import { LLMProvider, LLMProviderMessage, LLMProviderResponse } from '../llm-service';

export interface OpenAIProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 最大 token 数，默认 1024 */
  maxTokens?: number;
  /** 温度，默认 0.7 */
  temperature?: number;
}

export class OpenAIProvider implements LLMProvider {
  private config: Required<OpenAIProviderConfig>;

  constructor(config: OpenAIProviderConfig) {
    this.config = {
      maxTokens: 1024,
      temperature: 0.7,
      ...config,
    };
  }

  async chat(messages: LLMProviderMessage[]): Promise<LLMProviderResponse> {
    const url = `${this.config.baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content ?? '';

    return { content };
  }
}
