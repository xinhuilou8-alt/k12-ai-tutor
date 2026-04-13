/**
 * AI 服务配置中心
 * 从环境变量读取配置，支持 .env 文件
 */

export type LLMProviderName = 'openai' | 'baidu' | 'qwen' | 'mock';

export interface LLMConfig {
  /** 主 provider，第一优先调用 */
  provider: LLMProviderName;
  /**
   * fallback 顺序：主 provider 失败时依次尝试
   * 例如 LLM_PROVIDER=openai, LLM_FALLBACK=qwen,mock
   * 调用链: openai → qwen → mock
   * 不配置时默认 fallback 到 mock
   */
  fallbackOrder: LLMProviderName[];
  openai?: { apiKey: string; baseUrl: string; model: string };
  baidu?: { apiKey: string; secretKey: string; model: string };
  qwen?: { apiKey: string; baseUrl: string; model: string };
}

export interface OCRConfig {
  provider: 'baidu_ocr' | 'tencent_ocr' | 'mock';
  baiduOcr?: { apiKey: string; secretKey: string };
  tencentOcr?: { secretId: string; secretKey: string };
}

export interface ASRConfig {
  provider: 'baidu_asr' | 'tencent_asr' | 'mock';
  baiduAsr?: { appId: string; apiKey: string; secretKey: string };
}

export interface TTSConfig {
  provider: 'volcano' | 'baidu_tts' | 'tencent_tts' | 'mock';
  volcano?: {
    endpoint: string;
    token: string;
    appid: string;
    cluster: string;
    voiceType: string;
    speedRatio: number;
    audioFormat: string;
  };
  baiduTts?: { appId: string; apiKey: string; secretKey: string };
}

export interface AIConfig {
  llm: LLMConfig;
  ocr: OCRConfig;
  asr: ASRConfig;
  tts: TTSConfig;
}

/**
 * 解析 fallback 调用链
 * 
 * 规则：
 * 1. 如果设置了 LLM_FALLBACK，按指定顺序：主provider → fallback列表
 * 2. 如果没设置 LLM_FALLBACK，自动检测所有已配置 Key 的 provider 作为 fallback
 * 3. 最后兜底 mock
 * 
 * 例如：三个 Key 都填了，LLM_PROVIDER=openai
 * → 调用链: openai → qwen → mock（自动检测到 qwen 有 Key）
 */
function parseFallbackOrder(
  primary: string | undefined,
  fallbackEnv: string | undefined,
  env: Record<string, string | undefined>,
): LLMProviderName[] {
  const main = (primary as LLMProviderName) || 'mock';

  // 显式指定了 fallback 顺序
  if (fallbackEnv) {
    const explicit = fallbackEnv.split(',').map(s => s.trim()).filter(Boolean) as LLMProviderName[];
    const chain = [main, ...explicit];
    if (!chain.includes('mock')) chain.push('mock');
    return [...new Set(chain)]; // 去重
  }

  // 自动检测：按 openai → qwen → baidu → mock 的优先级
  const chain: LLMProviderName[] = [main];
  const autoDetect: [LLMProviderName, string][] = [
    ['openai', 'OPENAI_API_KEY'],
    ['qwen', 'QWEN_API_KEY'],
    ['baidu', 'BAIDU_API_KEY'],
  ];
  for (const [name, keyEnv] of autoDetect) {
    if (name !== main && env[keyEnv]) {
      chain.push(name);
    }
  }
  if (!chain.includes('mock')) chain.push('mock');
  return chain;
}

/**
 * 从 process.env 读取 AI 配置
 */
export function loadAIConfig(): AIConfig {
  const env = process.env;

  return {
    llm: {
      provider: (env.LLM_PROVIDER as LLMProviderName) || 'mock',
      fallbackOrder: parseFallbackOrder(env.LLM_PROVIDER, env.LLM_FALLBACK, env),
      openai: env.OPENAI_API_KEY ? {
        apiKey: env.OPENAI_API_KEY,
        baseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: env.OPENAI_MODEL || 'gpt-4o-mini',
      } : undefined,
      baidu: env.BAIDU_API_KEY ? {
        apiKey: env.BAIDU_API_KEY,
        secretKey: env.BAIDU_SECRET_KEY || '',
        model: env.BAIDU_MODEL || 'ernie-4.0-8k',
      } : undefined,
      qwen: env.QWEN_API_KEY ? {
        apiKey: env.QWEN_API_KEY,
        baseUrl: env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: env.QWEN_MODEL || 'qwen-plus',
      } : undefined,
    },
    ocr: {
      provider: (env.OCR_PROVIDER as OCRConfig['provider']) || 'mock',
      baiduOcr: env.BAIDU_OCR_API_KEY ? {
        apiKey: env.BAIDU_OCR_API_KEY,
        secretKey: env.BAIDU_OCR_SECRET_KEY || '',
      } : undefined,
      tencentOcr: env.TENCENT_OCR_SECRET_ID ? {
        secretId: env.TENCENT_OCR_SECRET_ID,
        secretKey: env.TENCENT_OCR_SECRET_KEY || '',
      } : undefined,
    },
    asr: {
      provider: (env.ASR_PROVIDER as ASRConfig['provider']) || 'mock',
      baiduAsr: env.BAIDU_ASR_APP_ID ? {
        appId: env.BAIDU_ASR_APP_ID,
        apiKey: env.BAIDU_ASR_API_KEY || '',
        secretKey: env.BAIDU_ASR_SECRET_KEY || '',
      } : undefined,
    },
    tts: {
      provider: (env.TTS_PROVIDER as TTSConfig['provider']) || 'mock',
      volcano: env.VOLCANO_TTS_TOKEN ? {
        endpoint: env.VOLCANO_TTS_ENDPOINT || 'https://openspeech.bytedance.com/api/v1/tts',
        token: env.VOLCANO_TTS_TOKEN,
        appid: env.VOLCANO_TTS_APPID || '',
        cluster: env.VOLCANO_TTS_CLUSTER || 'volcano_tts',
        voiceType: env.VOLCANO_TTS_VOICE_TYPE || 'zh_female_yingyujiaoxue_uranus_bigtts',
        speedRatio: parseFloat(env.VOLCANO_TTS_SPEED_RATIO || '1.0'),
        audioFormat: env.VOLCANO_TTS_AUDIO_FORMAT || 'mp3',
      } : undefined,
      baiduTts: env.BAIDU_TTS_APP_ID ? {
        appId: env.BAIDU_TTS_APP_ID,
        apiKey: env.BAIDU_TTS_API_KEY || '',
        secretKey: env.BAIDU_TTS_SECRET_KEY || '',
      } : undefined,
    },
  };
}

/**
 * 打印当前 AI 配置状态（隐藏 Key）
 */
export function printAIConfigStatus(config: AIConfig): void {
  const mask = (s?: string) => s ? s.slice(0, 4) + '****' : '未配置';

  console.log('\n  🤖 AI 服务配置状态');
  console.log('  ─────────────────');
  console.log(`  LLM:  ${config.llm.provider} ${config.llm.provider !== 'mock' ? '✅' : '⚠️ Mock模式'}`);
  console.log(`        调用链: ${config.llm.fallbackOrder.join(' → ')}`);
  if (config.llm.openai) console.log(`        OpenAI Key: ${mask(config.llm.openai.apiKey)} Model: ${config.llm.openai.model}`);
  if (config.llm.baidu) console.log(`        百度 Key: ${mask(config.llm.baidu.apiKey)} Model: ${config.llm.baidu.model}`);
  if (config.llm.qwen) console.log(`        通义 Key: ${mask(config.llm.qwen.apiKey)} Model: ${config.llm.qwen.model}`);
  console.log(`  OCR:  ${config.ocr.provider} ${config.ocr.provider !== 'mock' ? '✅' : '⚠️ Mock模式'}`);
  console.log(`  ASR:  ${config.asr.provider} ${config.asr.provider !== 'mock' ? '✅' : '⚠️ Mock模式'}`);
  console.log(`  TTS:  ${config.tts.provider} ${config.tts.provider !== 'mock' ? '✅' : '⚠️ Mock模式'}`);
  if (config.tts.volcano) console.log(`        火山引擎 Voice: ${config.tts.volcano.voiceType} AppID: ${config.tts.volcano.appid}`);
  console.log('  ─────────────────\n');
}
