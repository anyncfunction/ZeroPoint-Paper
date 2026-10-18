import katex from 'katex'

export function decodeBasicEntities(value: string): string {
  return value
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10))
    )
}

export function normalizeMathDelimiters(value: string): string {
  return value
    .replace(/\$\$([\s\S]*?)\$\$/g, (_match, expression: string) =>
      `$${expression.trim()}$`
    )
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression: string) =>
      `$${expression.trim()}$`
    )
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression: string) =>
      `$${expression.trim()}$`
    )
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function renderMathHtml(text: string): string {
  const normalized = normalizeMathDelimiters(decodeBasicEntities(text))
  const pattern = /\$([^$]+)\$/g
  let cursor = 0
  let output = ''

  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0
    output += escapeHtml(normalized.slice(cursor, index)).replace(/\n/g, '<br>')
    output += katex.renderToString(match[1], {
      throwOnError: false,
      strict: 'ignore',
      output: 'htmlAndMathml'
    })
    cursor = index + match[0].length
  }

  output += escapeHtml(normalized.slice(cursor)).replace(/\n/g, '<br>')
  return output
}

