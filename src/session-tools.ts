export function normalizeNoteContent(input: { content?: string; text?: string }) {
  const candidate = input.content?.trim().length ? input.content : input.text;
  if (!candidate || candidate.trim().length === 0) {
    throw new Error('note requires content or text');
  }
  return candidate.trim();
}

export function resolveSessionId({
  session_id,
  storedSessionId,
}: {
  session_id?: string;
  storedSessionId?: string;
}) {
  return session_id?.trim().length ? session_id : storedSessionId;
}
