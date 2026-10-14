/** Acotaciones de voz entre corchetes ([laughs], [sighs]…): solo las interpreta ElevenLabs v3. */
const TAG = /\s*\[[A-Za-zÀ-ÿ ,'-]{1,30}\]\s*/g;

export function stripAudioTags(text: string): string {
  return text.replace(TAG, " ").replace(/\s{2,}/g, " ").trim();
}

export function hasAudioTags(text: string): boolean {
  return /\[[A-Za-zÀ-ÿ ,'-]{1,30}\]/.test(text);
}
