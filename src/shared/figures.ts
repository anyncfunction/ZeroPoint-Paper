import type { FigureSpec } from './schemas'

function numberParam(
  params: Record<string, string | number | boolean | number[]>,
  key: string,
  fallback: number
): number {
  const value = params[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringParam(
  params: Record<string, string | number | boolean | number[]>,
  key: string,
  fallback: string
): string {
  const value = params[key]
  return typeof value === 'string' ? value : fallback
}

function svgFrame(content: string, label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 230" role="img" aria-label="${label}" class="math-figure">
  <g fill="none" stroke="#151515" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${content}</g>
  <text x="4" y="222" font-family="SimSun" font-size="11" fill="#555">${label}</text>
</svg>`
}

function numberLine(spec: FigureSpec): string {
  const min = Math.max(-1000, numberParam(spec.params, 'min', -5))
  const max = Math.min(1000, numberParam(spec.params, 'max', 5))
  const ticks = Math.max(2, Math.min(20, Math.round(numberParam(spec.params, 'ticks', 10))))
  const left = 42
  const right = 438
  const y = 112
  const pieces: string[] = [`<path d="M ${left} ${y} H ${right}"/>`]
  pieces.push(`<path d="M ${right - 12} ${y - 6} L ${right} ${y} L ${right - 12} ${y + 6}"/>`)
  for (let index = 0; index <= ticks; index += 1) {
    const x = left + ((right - left) * index) / ticks
    pieces.push(`<path d="M ${x.toFixed(2)} ${y - 6} V ${y + 6}"/>`)
    const value = min + ((max - min) * index) / ticks
    if (index % Math.max(1, Math.ceil(ticks / 8)) === 0) {
      pieces.push(
        `<text x="${x.toFixed(2)}" y="${y + 23}" font-family="Cambria Math, SimSun" font-size="14" text-anchor="middle" fill="#151515" stroke="none">${Number(value.toFixed(2))}</text>`
      )
    }
  }
  return svgFrame(pieces.join(''), '数轴示意图')
}

function coordinatePlane(spec: FigureSpec): string {
  const xMin = numberParam(spec.params, 'xMin', -5)
  const xMax = numberParam(spec.params, 'xMax', 5)
  const yMin = numberParam(spec.params, 'yMin', -4)
  const yMax = numberParam(spec.params, 'yMax', 4)
  const left = 70
  const right = 420
  const top = 25
  const bottom = 190
  const x0 = left + ((0 - xMin) / (xMax - xMin)) * (right - left)
  const y0 = bottom - ((0 - yMin) / (yMax - yMin)) * (bottom - top)
  const pieces = [
    `<path d="M ${left} ${y0} H ${right}"/>`,
    `<path d="M ${right - 10} ${y0 - 5} L ${right} ${y0} L ${right - 10} ${y0 + 5}"/>`,
    `<path d="M ${x0} ${bottom} V ${top}"/>`,
    `<path d="M ${x0 - 5} ${top + 10} L ${x0} ${top} L ${x0 + 5} ${top + 10}"/>`,
    `<text x="${right - 6}" y="${y0 - 10}" font-family="Cambria Math, SimSun" font-size="13" fill="#151515" stroke="none">x</text>`,
    `<text x="${x0 + 9}" y="${top + 12}" font-family="Cambria Math, SimSun" font-size="13" fill="#151515" stroke="none">y</text>`,
    `<text x="${x0 - 20}" y="${y0 + 18}" font-family="Cambria Math, SimSun" font-size="13" fill="#151515" stroke="none">O</text>`
  ]
  for (let x = Math.ceil(xMin); x <= xMax; x += 1) {
    if (x === 0) continue
    const px = left + ((x - xMin) / (xMax - xMin)) * (right - left)
    pieces.push(`<path d="M ${px.toFixed(2)} ${y0 - 3} V ${y0 + 3}" stroke-width="1"/>`)
  }
  for (let y = Math.ceil(yMin); y <= yMax; y += 1) {
    if (y === 0) continue
    const py = bottom - ((y - yMin) / (yMax - yMin)) * (bottom - top)
    pieces.push(`<path d="M ${x0 - 3} ${py.toFixed(2)} H ${x0 + 3}" stroke-width="1"/>`)
  }
  return svgFrame(pieces.join(''), '平面直角坐标系')
}

function functionCurve(spec: FigureSpec): string {
  const xMin = numberParam(spec.params, 'xMin', -5)
  const xMax = numberParam(spec.params, 'xMax', 5)
  const a = numberParam(spec.params, 'a', 1)
  const b = numberParam(spec.params, 'b', 0)
  const c = numberParam(spec.params, 'c', 0)
  const curve = stringParam(spec.params, 'curve', 'quadratic')
  const yValues: number[] = []
  for (let index = 0; index <= 80; index += 1) {
    const x = xMin + ((xMax - xMin) * index) / 80
    let y = 0
    if (curve === 'linear') y = a * x + b
    else if (curve === 'inverse') y = x === 0 ? Number.NaN : a / x + b
    else y = a * x * x + b * x + c
    if (Number.isFinite(y)) yValues.push(y)
  }
  const yMin = Math.min(-4, Math.floor(Math.min(...yValues, -1)))
  const yMax = Math.max(4, Math.ceil(Math.max(...yValues, 1)))
  const left = 68
  const right = 425
  const top = 24
  const bottom = 190
  const x0 = left + ((0 - xMin) / (xMax - xMin)) * (right - left)
  const y0 = bottom - ((0 - yMin) / (yMax - yMin)) * (bottom - top)
  const points: string[] = []
  let drawing = false
  for (let index = 0; index <= 100; index += 1) {
    const x = xMin + ((xMax - xMin) * index) / 100
    let y = 0
    if (curve === 'linear') y = a * x + b
    else if (curve === 'inverse') y = x === 0 ? Number.NaN : a / x + b
    else y = a * x * x + b * x + c
    if (!Number.isFinite(y) || y < yMin || y > yMax) {
      drawing = false
      continue
    }
    const px = left + ((x - xMin) / (xMax - xMin)) * (right - left)
    const py = bottom - ((y - yMin) / (yMax - yMin)) * (bottom - top)
    points.push(`${drawing ? 'L' : 'M'} ${px.toFixed(2)} ${py.toFixed(2)}`)
    drawing = true
  }
  const pieces = [
    `<path d="M ${left} ${y0} H ${right}"/>`,
    `<path d="M ${right - 10} ${y0 - 5} L ${right} ${y0} L ${right - 10} ${y0 + 5}"/>`,
    `<path d="M ${x0} ${bottom} V ${top}"/>`,
    `<path d="M ${x0 - 5} ${top + 10} L ${x0} ${top} L ${x0 + 5} ${top + 10}"/>`,
    `<path d="${points.join(' ')}" stroke-width="1.9"/>`,
    `<text x="${x0 - 20}" y="${y0 + 18}" font-family="Cambria Math, SimSun" font-size="13" fill="#151515" stroke="none">O</text>`
  ]
  return svgFrame(pieces.join(''), '函数图像')
}

function polygon(kind: string, spec: FigureSpec): string {
  const centerX = 250
  const centerY = 105
  const radius = 78
  let points: Array<[number, number]>
  if (kind === 'triangle') {
    const triangleKind = stringParam(spec.params, 'kind', 'general')
    if (triangleKind === 'right') {
      points = [
        [centerX - 90, centerY + 60],
        [centerX - 90, centerY - 50],
        [centerX + 70, centerY + 60]
      ]
    } else if (triangleKind === 'isosceles' || triangleKind === 'equilateral') {
      points = [
        [centerX - 80, centerY + 58],
        [centerX, centerY - 70],
        [centerX + 80, centerY + 58]
      ]
    } else {
      points = [
        [centerX - 95, centerY + 52],
        [centerX - 32, centerY - 62],
        [centerX + 92, centerY + 45]
      ]
    }
  } else {
    const quadKind = stringParam(spec.params, 'kind', 'general')
    if (quadKind === 'parallelogram' || quadKind === 'rectangle' || quadKind === 'rhombus') {
      const skew = quadKind === 'rectangle' ? 0 : 35
      points = [
        [centerX - 110 + skew, centerY + 56],
        [centerX - 55 + skew, centerY - 58],
        [centerX + 100 + skew, centerY - 58],
        [centerX + 155 + skew, centerY + 56]
      ].map(([x, y]) => [x - skew / 2, y])
    } else if (quadKind === 'trapezoid') {
      points = [
        [centerX - 120, centerY + 58],
        [centerX - 65, centerY - 55],
        [centerX + 74, centerY - 55],
        [centerX + 122, centerY + 58]
      ]
    } else {
      points = [
        [centerX - 105, centerY + 55],
        [centerX - 72, centerY - 60],
        [centerX + 83, centerY - 45],
        [centerX + 112, centerY + 62]
      ]
    }
  }
  const path = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')
  const labels = points
    .map(([x, y], index) => {
      const letter = String.fromCharCode(65 + index)
      const lx = x + (x < centerX ? -20 : x > centerX ? 12 : 0)
      const ly = y + (y < centerY ? -8 : 22)
      return `<text x="${lx}" y="${ly}" font-family="Cambria Math, SimSun" font-size="15" fill="#151515" stroke="none">${letter}</text>`
    })
    .join('')
  return svgFrame(`<path d="${path} Z"/>${labels}`, kind === 'triangle' ? '三角形' : '四边形')
}

function circleFigure(spec: FigureSpec): string {
  const centerX = 250
  const centerY = 105
  const radius = 68
  const showRadius = spec.params.showRadius === true
  const showDiameter = spec.params.showDiameter === true
  const pieces = [
    `<circle cx="${centerX}" cy="${centerY}" r="${radius}"/>`,
    `<text x="${centerX - 8}" y="${centerY + 5}" font-family="Cambria Math, SimSun" font-size="14" fill="#151515" stroke="none">O</text>`
  ]
  if (showRadius) {
    pieces.push(
      `<path d="M ${centerX} ${centerY} L ${centerX + radius} ${centerY}"/>`,
      `<text x="${centerX + radius / 2 - 8}" y="${centerY - 8}" font-family="Cambria Math, SimSun" font-size="12" fill="#151515" stroke="none">r</text>`
    )
  }
  if (showDiameter) {
    pieces.push(`<path d="M ${centerX - radius} ${centerY} H ${centerX + radius}"/>`)
  }
  return svgFrame(pieces.join(''), '圆示意图')
}

function angleFigure(spec: FigureSpec): string {
  const degrees = Math.max(5, Math.min(175, numberParam(spec.params, 'degrees', 60)))
  const radians = (degrees * Math.PI) / 180
  const x = 200
  const y = 160
  const length = 160
  const endX = x + length
  const endY = y
  const secondX = x + Math.cos(radians) * length
  const secondY = y - Math.sin(radians) * length
  const arcRadius = 42
  const arcX = x + arcRadius
  const arcY = y
  const arcEndX = x + Math.cos(radians) * arcRadius
  const arcEndY = y - Math.sin(radians) * arcRadius
  const pieces = [
    `<path d="M ${x} ${y} H ${endX}"/>`,
    `<path d="M ${x} ${y} L ${secondX.toFixed(2)} ${secondY.toFixed(2)}"/>`,
    `<path d="M ${arcX} ${arcY} A ${arcRadius} ${arcRadius} 0 0 0 ${arcEndX.toFixed(2)} ${arcEndY.toFixed(2)}" stroke-width="1"/>`,
    `<text x="${x + arcRadius + 8}" y="${y - 8}" font-family="Cambria Math, SimSun" font-size="13" fill="#151515" stroke="none">${degrees}°</text>`
  ]
  return svgFrame(pieces.join(''), '角示意图')
}

function customGeometry(spec: FigureSpec): string {
  const geometry = spec.geometry
  if (!geometry) return svgFrame('', '几何示意图')

  const points = new Map(geometry.points.map((point) => [point.id, point]))
  const x = (value: number): number => 45 + value * 3.9
  const y = (value: number): number => 190 - value * 1.55
  const pieces: string[] = []

  for (const segment of geometry.segments) {
    const from = points.get(segment.from)
    const to = points.get(segment.to)
    if (!from || !to) continue
    pieces.push(
      `<path d="M ${x(from.x).toFixed(2)} ${y(from.y).toFixed(2)} L ${x(to.x).toFixed(2)} ${y(to.y).toFixed(2)}"${segment.dashed ? ' stroke-dasharray="6 5"' : ''}/>`
    )
  }

  for (const rightAngle of geometry.rightAngles) {
    const vertex = points.get(rightAngle.vertex)
    const from = points.get(rightAngle.from)
    const to = points.get(rightAngle.to)
    if (!vertex || !from || !to) continue
    const vx = x(vertex.x)
    const vy = y(vertex.y)
    const first = { x: x(from.x) - vx, y: y(from.y) - vy }
    const second = { x: x(to.x) - vx, y: y(to.y) - vy }
    const firstLength = Math.hypot(first.x, first.y) || 1
    const secondLength = Math.hypot(second.x, second.y) || 1
    const size = 11
    const p1 = {
      x: vx + (first.x / firstLength) * size,
      y: vy + (first.y / firstLength) * size
    }
    const p2 = {
      x: p1.x + (second.x / secondLength) * size,
      y: p1.y + (second.y / secondLength) * size
    }
    const p3 = {
      x: vx + (second.x / secondLength) * size,
      y: vy + (second.y / secondLength) * size
    }
    pieces.push(
      `<path d="M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}" stroke-width="1"/>`
    )
  }

  for (const point of geometry.points) {
    const px = x(point.x)
    const py = y(point.y)
    pieces.push(
      `<circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="2.4" fill="#151515" stroke="none"/>`,
      `<text x="${(px + 7).toFixed(2)}" y="${(py - 7).toFixed(2)}" font-family="Cambria Math, SimSun" font-size="14" fill="#151515" stroke="none">${point.label.replace(/[<>&"]/g, '')}</text>`
    )
  }

  for (const annotation of geometry.annotations) {
    pieces.push(
      `<text x="${x(annotation.x).toFixed(2)}" y="${y(annotation.y).toFixed(2)}" font-family="Cambria Math, SimSun" font-size="12" text-anchor="middle" fill="#333" stroke="none">${annotation.text.replace(/[<>&"]/g, '')}</text>`
    )
  }

  return svgFrame(
    pieces.join(''),
    spec.caption ?? '几何示意图'
  )
}

export function renderFigureSvg(spec: FigureSpec): string {
  switch (spec.template) {
    case 'number_line':
      return numberLine(spec)
    case 'coordinate_plane':
      return coordinatePlane(spec)
    case 'function_curve':
      return functionCurve(spec)
    case 'triangle':
      return polygon('triangle', spec)
    case 'quadrilateral':
      return polygon('quadrilateral', spec)
    case 'circle':
      return circleFigure(spec)
    case 'angle':
      return angleFigure(spec)
    case 'custom_geometry':
      return customGeometry(spec)
  }
}

