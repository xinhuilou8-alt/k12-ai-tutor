/**
 * LLM Provider 工厂 — 支持多 Provider + 自动 Fallback
 *
 * 调用链示例：openai → qwen → mock
 * 主 provider 失败时自动尝试下一个，直到成功或全部失败
 */
import { LLMProvider, LLMProviderMessage, LLMProviderResponse, MockLLMProvider } from '../llm-service';
import { OpenAIProvider } from './openai-provider';
import type { LLMConfig, LLMProviderName } from '../../../shared/src/config';

export { OpenAIProvider } from './openai-provider';
export type { OpenAIProviderConfig } from './openai-provider';

/**
 * 为单个 provider name 创建实例，Key 缺失返回 null
 */
function createSingleProvider(name: LLMProviderName, config: LLMConfig): LLMProvider | null {
  switch (name) {
    case 'openai':
      if (!config.openai?.apiKey) return null;
      return new OpenAIProvider({
        apiKey: config.openai.apiKey,
        baseUrl: config.openai.baseUrl,
        model: config.openai.model,
      });
    case 'qwen':
      if (!config.qwen?.apiKey) return null;
      return new OpenAIProvider({
        apiKey: config.qwen.apiKey,
        baseUrl: config.qwen.baseUrl,
        model: config.qwen.model,
      });
    case 'baidu':
      // 百度文心一言 API 格式不同，暂未实现
      if (!config.baidu?.apiKey) return null;
      console.warn('  ⚠️ 百度文心一言 Provider 尚未实现，跳过');
      return null;
    case 'mock':
      return new MockLLMProvider();
    default:
      return null;
  }
}

/**
 * Fallback Provider — 按调用链依次尝试，失败自动切换下一个
 */
class FallbackLLMProvider implements LLMProvider {
  private providers: { name: string; provider: LLMProvider }[];

  constructor(providers: { name: string; provider: LLMProvider }[]) {
    this.providers = providers;
  }

  async chat(messages: LLMProviderMessage[]): Promise<LLMProviderResponse> {
    let lastError: Error | null = null;

    for (const { name, provider } of this.providers) {
      try {
        const result = await provider.chat(messages);
        return result;
      } catch (err: any) {
        console.warn(`  ⚠️ [${name}] 调用失败: ${err.message}，尝试下一个...`);
        lastError = err;
      }
    }

    throw lastError || new Error('所有 LLM Provider 均不可用');
  }
}

/**
 * 根据配置创建 LLM Provider（支持 fallback 链）
 *
 * 填了多个 Key 时的行为：
 * - LLM_PROVIDER 决定主 provider（第一优先）
 * - LLM_FALLBACK 决定 fallback 顺序（可选）
 * - 没配 LLM_FALLBACK 时，自动检测已填 Key 的 provider 作为 fallback
 * - 最终兜底 mock
 *
 * 例如：三个 Key 都填了，LLM_PROVIDER=openai
 * → 调用链: openai → qwen → mock
 * → openai 失败时自动切到 qwen，qwen 也失败则用 mock
 */
export function createLLMProvider(config: LLMConfig): LLMProvider {
  const chain = config.fallbackOrder;
  const providers: { name: string; provider: LLMProvider }[] = [];

  for (const name of chain) {
    const p = createSingleProvider(name, config);
    if (p) {
      providers.push({ name, provider: p });
    }
  }

  // 确保至少有 mock 兜底
  if (providers.length === 0) {
    providers.push({ name: 'mock', provider: new MockLLMProvider() });
  }

  // 只有一个 provider 时直接返回，不需要 fallback 包装
  if (providers.length === 1) {
    return providers[0].provider;
  }

  console.log(`  🔗 LLM 调用链: ${providers.map(p => p.name).join(' → ')}`);
  return new FallbackLLMProvider(providers);
}
