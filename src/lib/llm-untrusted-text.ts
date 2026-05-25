const SAFE_LABEL_RE = /[^A-Za-z0-9_.:-]+/g

function sanitizeBoundaryLabel(label: string): string {
  return label.replace(SAFE_LABEL_RE, '_').replace(/^_+|_+$/g, '') || 'user_content'
}

function escapeBoundaryContent(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Use at every future LLM prompt boundary that includes public/user-controlled text.
 * This is not a runtime mitigation until the returned block is actually used in a prompt.
 */
export function quoteUntrustedForPrompt(label: string, value: string): string {
  return [
    `<untrusted_data label="${sanitizeBoundaryLabel(label)}">`,
    escapeBoundaryContent(value),
    '</untrusted_data>',
  ].join('\n')
}
