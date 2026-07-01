/**
 * AI configuration repository.
 * Stores OpenAI-compatible service connection settings in localStorage.
 * Compatible with DeepSeek / OpenAI / Moonshot / SiliconFlow / 通义千问 / custom services.
 */
const AI_CONFIG_KEY = "aiConfig";

const DEFAULT_PROMPT = `你是一个专业的个人周报生成助手。请根据用户提供的本周待办任务清单，生成一份结构清晰的周报总结。

要求：
1. 输出一份 Markdown 格式的周报
2. 包含以下部分：
   - 本周完成（按类别或重要程度归纳已完成任务）
   - 未完成 / 推迟（说明遗留任务）
   - 本周亮点（1-3 条关键成果）
   - 改进建议 / 反思
3. 使用中文输出，语言专业、简洁
4. 避免空话，聚焦于具体任务内容
5. 结尾给出一句正向鼓励`;

const PRESETS = {
  deepseek: {
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-chat",
  },
  openai: {
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
  },
  qwen: {
    name: "通义千问",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-turbo",
  },
  moonshot: {
    name: "Moonshot",
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
    model: "moonshot-v1-8k",
  },
  siliconflow: {
    name: "SiliconFlow",
    endpoint: "https://api.siliconflow.cn/v1/chat/completions",
    model: "Qwen/Qwen2.5-7B-Instruct",
  },
};

export default {
  PRESETS,
  DEFAULT_PROMPT,

  load() {
    try {
      const raw = localStorage.getItem(AI_CONFIG_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error("Failed to load AI config:", e);
    }
    return {
      endpoint: "",
      apiKey: "",
      model: "",
      carryContext: false,
      contextRounds: 5,
      systemPrompt: DEFAULT_PROMPT,
      history: [], // [{role, content}] — recent context
    };
  },

  save(config) {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
  },

  update(partial) {
    const current = this.load();
    const updated = { ...current, ...partial };
    this.save(updated);
    return updated;
  },

  clear() {
    localStorage.removeItem(AI_CONFIG_KEY);
  },

  isConfigured() {
    const c = this.load();
    return !!(c.endpoint && c.apiKey && c.model);
  },

  applyPreset(presetKey) {
    const preset = PRESETS[presetKey];
    if (!preset) return null;
    return this.update({
      endpoint: preset.endpoint,
      model: preset.model,
    });
  },
};
