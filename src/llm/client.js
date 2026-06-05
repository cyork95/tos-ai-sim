import Anthropic from '@anthropic-ai/sdk';
import { LLM_CONFIG } from './config.js';
import { extractJson } from './parseJson.js';

// Lazy client — created on first call so dotenv has already run by then
let _anthropic = null;
function getClient() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

/**
 * Call the LLM with a system prompt and user message.
 * Retries on JSON parse failure, reminding the model to return valid JSON.
 */
export async function callLLM({ system, user, model, temperature, maxTokens, expectJson = true }) {
  const resolvedModel = model ?? LLM_CONFIG.playerModel;
  const resolvedTemp = temperature ?? LLM_CONFIG.playerTemperature;
  const resolvedMax = maxTokens ?? LLM_CONFIG.playerMaxTokens;
  const maxRetries = LLM_CONFIG.maxRetries ?? 3;

  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const userMsg = attempt > 1
      ? `${user}\n\nIMPORTANT: Your previous response could not be parsed as JSON. Return ONLY valid JSON with no markdown fences, no commentary, no preamble.`
      : user;

    const response = await getClient().messages.create({
      model: resolvedModel,
      max_tokens: resolvedMax,
      temperature: resolvedTemp,
      system,
      messages: [{ role: 'user', content: userMsg }],
    });

    const text = response.content[0]?.text ?? '';

    if (!expectJson) return text;

    try {
      return extractJson(text);
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries) {
        console.error(`  [LLM] JSON parse attempt ${attempt} failed, retrying... (${e.message})`);
      }
    }
  }

  throw new Error(`LLM JSON parse failed after ${maxRetries} attempts: ${lastError.message}`);
}
