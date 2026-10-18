import type { JSX } from 'react'
import { renderMathHtml } from '../../../shared/rich-text'

export function RichText({
  text,
  className
}: {
  text: string
  className?: string
}): JSX.Element {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: renderMathHtml(text) }}
    />
  )
}

