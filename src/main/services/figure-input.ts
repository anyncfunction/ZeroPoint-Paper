const TEMPLATE_ALIASES: Record<string, string> = {
  numberline: 'number_line',
  coordinate_system: 'coordinate_plane',
  cartesian_plane: 'coordinate_plane',
  function_graph: 'function_curve',
  function_plot: 'function_curve',
  geometry: 'custom_geometry',
  custom: 'custom_geometry'
}

function identifier(value: string): string {
  return value.trim().replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[\s-]+/g, '_').toLowerCase()
}

function isAbsent(value: unknown): boolean {
  return value == null || (typeof value === 'string' && /^(?:none|null|no_figure|无|无需配图)?$/i.test(value.trim()))
}

export function normalizeFigureInput(input: unknown): unknown {
  if (isAbsent(input)) return undefined
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  const value = input as Record<string, unknown>
  if (Object.keys(value).length === 0) return undefined
  const template = value.template !== undefined ? value.template : value.templateId ?? value.type
  if (isAbsent(template) && template !== undefined) return undefined
  const name = typeof template === 'string' ? identifier(template) : template
  const geometry = value.geometry ?? (
    Array.isArray(value.points) && Array.isArray(value.segments)
      ? { points: value.points, segments: value.segments, rightAngles: value.rightAngles, annotations: value.annotations }
      : undefined
  )
  return {
    ...value,
    template: name === undefined && geometry ? 'custom_geometry' : TEMPLATE_ALIASES[String(name)] ?? name,
    ...(geometry ? { geometry } : {})
  }
}

export function requiresFigure(stem: string): boolean {
  return /如[下左右]?图|[上下左右]图|图中|图示|图像所示|图形所示/.test(stem)
}
