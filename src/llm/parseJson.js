/**
 * Extract and parse JSON from an LLM response string.
 * Handles markdown fences, leading/trailing text, and partial wrapping.
 */
export function extractJson(text) {
  if (!text || typeof text !== 'string') throw new Error('Empty response from LLM');

  // Strip markdown code fences if present
  let cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();

  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch (_) {}

  // Find first { or [ and last matching } or ]
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let start = -1;
  let endChar = '';

  if (firstBrace === -1 && firstBracket === -1) {
    throw new Error(`No JSON object found in response: ${text.slice(0, 200)}`);
  }

  if (firstBrace === -1) { start = firstBracket; endChar = ']'; }
  else if (firstBracket === -1) { start = firstBrace; endChar = '}'; }
  else if (firstBrace < firstBracket) { start = firstBrace; endChar = '}'; }
  else { start = firstBracket; endChar = ']'; }

  const end = cleaned.lastIndexOf(endChar);
  if (end === -1 || end < start) {
    throw new Error(`Malformed JSON in response: ${text.slice(0, 200)}`);
  }

  const candidate = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (e) {
    throw new Error(`JSON parse failed after extraction: ${e.message}\nCandidate: ${candidate.slice(0, 300)}`);
  }
}
