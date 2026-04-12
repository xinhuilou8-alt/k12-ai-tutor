// @k12-ai/llm-service - 大模型服务
export {
  LLMProvider,
  LLMProviderMessage,
  LLMProviderResponse,
  MockLLMProvider,
  LLMServiceImpl,
  GradeLanguageConfig,
  getGradeLanguageConfig,
  getGuidanceLevelInstruction,
} from './llm-service';

export {
  ChildLearningBackground,
  buildBackgroundPromptSection,
  describeTrend,
} from './prompt-background-builder';
