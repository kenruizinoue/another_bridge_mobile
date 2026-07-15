/**
 * Reads the personal OpenAI API key for the optional cloud transcription
 * engine. Access is static (process.env.EXPO_PUBLIC_OPENAI_API_KEY) so
 * Expo inlines it into the bundle at build time; a dynamic lookup would
 * read back undefined in a release build. Returns null when unset/blank.
 */
export function getOpenAiApiKey(): string | null {
  const key = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}
