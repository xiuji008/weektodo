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
   * Send a chat completion request with streaming (SSE) response.
   * @param {Object} params
   * @param {string} params.userMessage - The latest user message
   * @param {function} params.onChunk - Callback(fullContent, delta) on each chunk received
   * @param {function} params.onDone - Callback(fullContent) when streaming completes
   * @param {function} params.onError - Callback(errorMessage) on failure
   */
  async chatStream({ userMessage, onChunk, onDone, onError }) {
    const config = aiConfigRepository.load();
    if (!aiConfigRepository.isConfigured()) {
      onError("AI_NOT_CONFIGURED");
      return;
    }

    const messages = [];
    if (config.systemPrompt && config.systemPrompt.trim()) {
      messages.push({ role: "system", content: config.systemPrompt });
    }

    if (config.carryContext && Array.isArray(config.history) && config.history.length > 0) {
      const rounds = Math.max(1, parseInt(config.contextRounds) || 5);
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
          stream: true,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        onError(`HTTP ${response.status}: ${errText || response.statusText}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";
      let readerDone = false;

      while (!readerDone) {
        const { done, value } = await reader.read();
        readerDone = done;
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.choices?.[0]?.delta?.content || "";
            if (delta) {
              fullContent += delta;
              onChunk(fullContent, delta);
            }
          } catch (e) {
            // skip non-JSON SSE lines
          }
        }
      }

      // Handle final buffer
      if (buffer.trim() && buffer.trim().startsWith("data: ")) {
        const data = buffer.trim().slice(6);
        if (data !== "[DONE]") {
          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.choices?.[0]?.delta?.content || "";
            if (delta) fullContent += delta;
          } catch (e) { /* ignore non-JSON */ }
        }
      }

      // Save to history
      if (config.carryContext) {
        const history = (config.history || []).concat([
          { role: "user", content: userMessage },
          { role: "assistant", content: fullContent },
        ]);
        aiConfigRepository.update({ history });
      } else {
        aiConfigRepository.update({ history: [] });
      }

      onDone(fullContent);
    } catch (err) {
      onError(err.message || String(err));
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
