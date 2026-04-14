import { describe, expect, it } from 'vitest';
import { normalizeNoteContent, resolveSessionId } from '../src/session-tools';

describe('session-tools', () => {
  it('accepts content field', () => {
    expect(normalizeNoteContent({ content: 'hello' })).toBe('hello');
  });

  it('accepts text alias field', () => {
    expect(normalizeNoteContent({ text: 'hello' })).toBe('hello');
  });

  it('trims text values', () => {
    expect(normalizeNoteContent({ text: '  hello  ' })).toBe('hello');
  });

  it('rejects missing content', () => {
    expect(() => normalizeNoteContent({})).toThrow('note requires content or text');
  });

  it('prefers explicit session_id when provided', () => {
    expect(resolveSessionId({ session_id: 'abc', storedSessionId: 'def' })).toBe('abc');
  });

  it('falls back to stored session id when explicit is missing', () => {
    expect(resolveSessionId({ storedSessionId: 'def' })).toBe('def');
  });
});
