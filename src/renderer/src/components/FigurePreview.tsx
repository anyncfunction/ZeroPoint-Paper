import type { JSX } from 'react'
import type { FigureSpec } from '../../../shared/schemas'
import { renderFigureSvg } from '../../../shared/figures'

export function FigurePreview({
  figure,
  compact = false
}: {
  figure: FigureSpec
  compact?: boolean
}): JSX.Element {
  return (
    <div
      className={compact ? 'figure-preview compact' : 'figure-preview'}
      dangerouslySetInnerHTML={{ __html: renderFigureSvg(figure) }}
    />
  )
}

