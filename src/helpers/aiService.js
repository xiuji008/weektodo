/**
 * AI Service — lightweight OpenAI-compatible chat completion client.
 * No external SDK; uses native fetch.
 */
import aiConfigRepository from "../repositories/aiConfigRepository";

export default {
  /**
   * Send a chat completion request.
   * @param {Object} params
   * @param {string} params.userMessage - The latest user message
   * @returns {Promise<{ok: boolean, content?: string, error?: string}>}
   */
  async chat({ userMessage }) {
    const config = aiConfigRepository.load();
    if (!aiConfigRepository.isConfigured()) {
      return { ok: false, error: "AI_NOT_CONFIGURED" };
    }

    const messages = [];
    if (config.systemPrompt && config.systemPrompt.trim()) {
      messages.push({ role: "system", content: config.systemPrompt });
    }

    if (config.carryContext && Array.isArray(config.history) && config.history.length > 0) {
      const rounds = Math.max(1, parseInt(config.contextRounds) || 5);
      // Keep last N user+assistant pairs
      const slice = config.history.slice(-rounds * 2);
      messages.push(...slice);
    }

    messages.push({ role: "user", content: userMessage });

    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        return { ok: false, error: `HTTP ${response.status}: ${errText || response.statusText}` };
      }

      const data = await response.json();
      const content =
        data?.choices?.[0]?.message?.content?.trim() ||
        data?.choices?.[0]?.text ||
        "";

      if (!content) {
        return { ok: false, error: "EMPTY_RESPONSE" };
      }

      // Update history
      if (config.carryContext) {
        const history = (config.history || []).concat([
          { role: "user", content: userMessage },
          { role: "assistant", content },
        ]);
        aiConfigRepository.update({ history });
      } else {
        aiConfigRepository.update({ history: [] });
      }

      return { ok: true, content };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  },

  /**
   * Test AI connection with a minimal prompt.
   * @returns {Promise<{ok: boolean, content?: string, error?: string}>}
   */
  async testConnection() {
    if (!aiConfigRepository.isConfigured()) {
      return { ok: false, error: "AI_NOT_CONFIGURED" };
    }
    return this.chat({ userMessage: "请只回复 OK 两个字符。" });
  },

  clearHistory() {
    aiConfigRepository.update({ history: [] });
  },
};
