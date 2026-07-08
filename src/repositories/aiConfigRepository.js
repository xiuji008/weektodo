/**
 * AI configuration repository.
 * Stores OpenAI-compatible service connection settings in localStorage.
 * Compatible with DeepSeek / OpenAI / Moonshot / SiliconFlow / 通义千问 / custom services.
 */
const AI_CONFIG_KEY = "aiConfig";

/** 周报生成系统提示词（默认） */
const DEFAULT_PROMPT = `你是一个专业的个人周报撰写专家。请根据用户提供的本周任务数据，生成一份结构清晰、内容精炼的周报总结。

数据中 ✓ 表示已完成，✗ 表示未完成。

输出要求：
1. 使用 Markdown 格式输出，包含以下四部分：

   ## 📋 本周完成
   - 按类别或重要程度归纳已完成任务
   - 突出关键成果，用具体数据说话（如完成率、任务数等）

   ## ⏳ 未完成 / 推迟
   - 列出未完成任务及简要原因
   - 给出下周处理建议

   ## ✨ 本周亮点
   - 提炼 1-3 条最有价值的成果或进步

   ## 💡 改进建议
   - 基于执行情况，给出 1-2 条可操作的建议

2. 语言专业简洁，使用中文
3. 结尾附一句正向鼓励
4. 整体控制在 300-600 字`;

/** 周待办生成系统提示词（默认） */
const DEFAULT_TODO_PROMPT = `你是一个智能周待办规划助手。请根据用户描述的本周计划，生成结构化的待办事项 JSON 数据。

你必须严格遵守以下格式要求：

1. 输出纯 JSON 数组，不要包含任何 markdown 包裹标记（不要 \`\`\`json）
2. 每个待办对象格式：
   {
     "dateId": "20260701",    // 必填，YYYYMMDD，必须使用给定的 dateId
     "text": "任务标题",       // 必填，中文，简洁明确
     "time": "14:00",         // 可选，具体时间
     "color": "#77e785",      // 可选
     "priorityLevel": "L3",   // 可选，优先级 L1~L5，默认为 L3
     "desc": "备注"           // 可选
   }

3. dateId 只能从用户提供的日期中选择，不可自行编造
4. 用户未指定日期的任务，智能分配到最合适的日期
5. 学习类任务分散到多个工作日
6. 尽量完整覆盖用户描述，不要遗漏重要事项
7. 使用中文任务标题，简洁明确
8. ⚠️ 禁止为过去的时间生成任务。如果 dateId 小于当前日期，则跳过该任务
9. ⚠️ 如果 dateId 等于当前日期，且 time 早于当前时间，则不要设置 time（留空）或将任务分配到后续日期

## 优先级定义（请根据任务性质和紧急程度智能分配）

| 等级 | 标签 | 处理时效 | 颜色 |
|------|------|---------|------|
| **L1** | 今日必保 | 今天必须完成 | 🔴 红色 |
| **L2** | 今日主攻 | 今天优先推进 | 🟠 橙色 |
| **L3** | 本周排期 | 本周内完成即可 | 🔵 蓝色 |
| **L4** | 有空再做 | 本月内考虑 | 🟢 绿色 |
| **L5** | 未来待定 | 不承诺本月完成 | ⚪ 灰色 |

分配指导：
- **L1**：有明确截止日且是最后一天；涉及他人等待；有违约/失信/经济损失风险
- **L2**：对长期目标有显著推动；虽无硬截止日但拖过今天会影响下周节奏
- **L3**：日常例行事务；有截止日但在周末之后；不紧急的自我提升（**默认**）
- **L4**：做了有加分、不做无影响；需要大块时间但当前无法安排
- **L5**：探索性想法；暂时不具备条件的事项`;

/** 兼容旧引用 */
const DEFAULT_SUMMARY_PROMPT = DEFAULT_PROMPT;

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
  tencent_v4_flash: {
    name: "腾讯 deepseek-v4-flash-202605",
    endpoint: "https://tokenhub.tencentmaas.com/v1/chat/completions",
    model: "deepseek-v4-flash-202605",
  },
  tencent_hy3: {
    name: "腾讯 hy3-preview",
    endpoint: "https://tokenhub.tencentmaas.com/v1/chat/completions",
    model: "hy3-preview",
  },
};

export default {
  PRESETS,
  DEFAULT_PROMPT,
  DEFAULT_TODO_PROMPT,
  DEFAULT_SUMMARY_PROMPT,

  load() {
    try {
      const raw = localStorage.getItem(AI_CONFIG_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        // 合并默认值，确保新字段不丢失
        return {
          endpoint: "",
          apiKey: "",
          model: "",
          carryContext: false,
          contextRounds: 5,
          systemPrompt: DEFAULT_PROMPT,
          todoSystemPrompt: DEFAULT_TODO_PROMPT,
          history: [],
          ...saved,
        };
      }
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
      todoSystemPrompt: DEFAULT_TODO_PROMPT,
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
