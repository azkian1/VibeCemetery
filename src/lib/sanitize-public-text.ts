const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g
const HTML_TAG_RE = /<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*)?>/g
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const BIDI_OVERRIDE_RE = /[\u202A-\u202E\u2066-\u2069]/g
const ZERO_WIDTH_RE = /[\u200B-\u200F\uFEFF]/g

export function sanitizePublicText(value: string, maxLength?: number): string {
  const sanitized = value
    .replace(HTML_COMMENT_RE, '')
    .replace(HTML_TAG_RE, '')
    .replace(CONTROL_CHARS_RE, '')
    .replace(BIDI_OVERRIDE_RE, '')
    .replace(ZERO_WIDTH_RE, '')
    .replace(/\s+/g, ' ')
    .trim()

  return typeof maxLength === 'number' ? Array.from(sanitized).slice(0, maxLength).join('') : sanitized
}
