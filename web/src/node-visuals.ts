// One visual vocabulary for reasoning-node silhouettes. Cytoscape (Structural
// view), the SVG timeline (Viewer), and the legend all consume this module so a
// kind cannot acquire three subtly different meanings across the product.

export type FocusVisualKind =
  | 'observation'
  | 'claim'
  | 'hypothesis'
  | 'option'
  | 'decision'
  | 'goal'
  | 'memory'
  | 'assumption'
  | 'outcome'
  | 'action'

export type NodeVisualKind = FocusVisualKind | 'question'
export type ShapeSide = 'L' | 'R' | 'T' | 'B'

type ShapeKey =
  | 'round-rectangle'
  | 'ellipse'
  | 'hexagon'
  | 'tag'
  | 'octagon'
  | 'pentagon'
  | 'barrel'
  | 'cut-rectangle'
  | 'rhomboid'
  | 'chevron'
  | 'diamond'

export interface NodeVisual {
  kind: NodeVisualKind
  label: string
  shape: ShapeKey
  cytoscapeShape: string
  /** Fraction of the bounding box that is comfortably usable by text. */
  textWidth: number
  cytoscapePolygon?: string
}

const ACTION_POLYGON = '-1 -1 0.55 -1 1 0 0.55 1 -1 1 -0.62 0'

export const FOCUS_VISUALS: readonly NodeVisual[] = [
  { kind: 'observation', label: 'Observation', shape: 'round-rectangle', cytoscapeShape: 'round-rectangle', textWidth: 0.84 },
  { kind: 'claim', label: 'Claim', shape: 'ellipse', cytoscapeShape: 'ellipse', textWidth: 0.74 },
  { kind: 'hypothesis', label: 'Hypothesis', shape: 'hexagon', cytoscapeShape: 'round-hexagon', textWidth: 0.69 },
  { kind: 'assumption', label: 'Assumption', shape: 'cut-rectangle', cytoscapeShape: 'cut-rectangle', textWidth: 0.76 },
  { kind: 'option', label: 'Option', shape: 'tag', cytoscapeShape: 'round-tag', textWidth: 0.68 },
  { kind: 'decision', label: 'Decision', shape: 'octagon', cytoscapeShape: 'round-octagon', textWidth: 0.72 },
  { kind: 'goal', label: 'Goal', shape: 'pentagon', cytoscapeShape: 'round-pentagon', textWidth: 0.63 },
  { kind: 'action', label: 'Action', shape: 'chevron', cytoscapeShape: 'polygon', textWidth: 0.62, cytoscapePolygon: ACTION_POLYGON },
  { kind: 'outcome', label: 'Outcome', shape: 'rhomboid', cytoscapeShape: 'rhomboid', textWidth: 0.62 },
  { kind: 'memory', label: 'Memory', shape: 'barrel', cytoscapeShape: 'barrel', textWidth: 0.73 },
] as const

export const QUESTION_VISUAL: NodeVisual = {
  kind: 'question', label: 'Question', shape: 'diamond', cytoscapeShape: 'round-diamond', textWidth: 0.56,
}

const BY_KIND = new Map<NodeVisualKind, NodeVisual>(
  [...FOCUS_VISUALS, QUESTION_VISUAL].map((v) => [v.kind, v]),
)

export function nodeVisual(kind: string | undefined): NodeVisual {
  return BY_KIND.get(kind as NodeVisualKind) ?? BY_KIND.get('observation')!
}

export function cytoscapeShapeStyle(kind: string | undefined): Record<string, unknown> {
  const visual = nodeVisual(kind)
  const style: Record<string, unknown> = {
    shape: visual.cytoscapeShape,
    'text-max-width': `${Math.round(160 * visual.textWidth)}px`,
  }
  if (visual.cytoscapePolygon) style['shape-polygon-points'] = visual.cytoscapePolygon
  return style
}

type Point = { x: number; y: number }
export interface SvgShape {
  tag: 'rect' | 'ellipse' | 'path'
  attrs: Record<string, string | number>
}

const POLYGONS: Partial<Record<ShapeKey, readonly Point[]>> = {
  hexagon: [
    { x: 0.14, y: 0 }, { x: 0.86, y: 0 }, { x: 1, y: 0.5 },
    { x: 0.86, y: 1 }, { x: 0.14, y: 1 }, { x: 0, y: 0.5 },
  ],
  tag: [
    { x: 0.04, y: 0 }, { x: 0.78, y: 0 }, { x: 1, y: 0.5 },
    { x: 0.78, y: 1 }, { x: 0.04, y: 1 }, { x: 0, y: 0.82 }, { x: 0, y: 0.18 },
  ],
  octagon: [
    { x: 0.16, y: 0 }, { x: 0.84, y: 0 }, { x: 1, y: 0.28 }, { x: 1, y: 0.72 },
    { x: 0.84, y: 1 }, { x: 0.16, y: 1 }, { x: 0, y: 0.72 }, { x: 0, y: 0.28 },
  ],
  pentagon: [
    { x: 0.5, y: 0 }, { x: 1, y: 0.38 }, { x: 0.82, y: 1 },
    { x: 0.18, y: 1 }, { x: 0, y: 0.38 },
  ],
  'cut-rectangle': [
    { x: 0.09, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.82 },
    { x: 0.91, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0.18 },
  ],
  rhomboid: [
    { x: 0.16, y: 0 }, { x: 1, y: 0 }, { x: 0.84, y: 1 }, { x: 0, y: 1 },
  ],
  chevron: [
    { x: 0, y: 0 }, { x: 0.76, y: 0 }, { x: 1, y: 0.5 },
    { x: 0.76, y: 1 }, { x: 0, y: 1 }, { x: 0.18, y: 0.5 },
  ],
  diamond: [
    { x: 0.5, y: 0 }, { x: 1, y: 0.5 }, { x: 0.5, y: 1 }, { x: 0, y: 0.5 },
  ],
}

function scaledPoints(shape: ShapeKey, x: number, y: number, width: number, height: number): Point[] {
  return (POLYGONS[shape] ?? []).map((p) => ({ x: x + p.x * width, y: y + p.y * height }))
}

function polygonPath(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)},${round(p.y)}`).join(' ') + ' Z'
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** Geometry for the SVG Viewer and the shape samples in the legend. */
export function svgNodeShape(
  kind: string | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
): SvgShape {
  const { shape } = nodeVisual(kind)
  if (shape === 'round-rectangle') {
    return { tag: 'rect', attrs: { x, y, width, height, rx: Math.min(12, height * 0.22) } }
  }
  if (shape === 'ellipse') {
    return {
      tag: 'ellipse',
      attrs: { cx: x + width / 2, cy: y + height / 2, rx: width / 2, ry: height / 2 },
    }
  }
  if (shape === 'barrel') {
    const dx = width * 0.12
    return {
      tag: 'path',
      attrs: {
        d: `M${round(x + dx)},${round(y)} Q${round(x)},${round(y)} ${round(x)},${round(y + height / 2)} Q${round(x)},${round(y + height)} ${round(x + dx)},${round(y + height)} L${round(x + width - dx)},${round(y + height)} Q${round(x + width)},${round(y + height)} ${round(x + width)},${round(y + height / 2)} Q${round(x + width)},${round(y)} ${round(x + width - dx)},${round(y)} Z`,
      },
    }
  }
  return { tag: 'path', attrs: { d: polygonPath(scaledPoints(shape, x, y, width, height)) } }
}

/**
 * Return a boundary point on the actual silhouette for a routed edge. The
 * timeline still chooses a side and fans multiple edges along it; this adjusts
 * that nominal port inward for diamonds, polygons, ellipses, and barrels.
 */
export function shapePort(
  kind: string | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  side: ShapeSide,
  fraction: number,
): Point {
  const f = Math.max(0.08, Math.min(0.92, fraction))
  const { shape } = nodeVisual(kind)
  if (shape === 'round-rectangle') {
    if (side === 'L') return { x, y: y + height * f }
    if (side === 'R') return { x: x + width, y: y + height * f }
    if (side === 'T') return { x: x + width * f, y }
    return { x: x + width * f, y: y + height }
  }
  if (shape === 'ellipse') {
    if (side === 'L' || side === 'R') {
      const dy = (f - 0.5) * 2
      const dx = Math.sqrt(Math.max(0, 1 - dy * dy)) * width / 2
      return { x: x + width / 2 + (side === 'L' ? -dx : dx), y: y + height * f }
    }
    const dx = (f - 0.5) * 2
    const dy = Math.sqrt(Math.max(0, 1 - dx * dx)) * height / 2
    return { x: x + width * f, y: y + height / 2 + (side === 'T' ? -dy : dy) }
  }
  if (shape === 'barrel') {
    if (side === 'L' || side === 'R') {
      const inset = width * 0.12 * Math.abs(f * 2 - 1)
      return { x: side === 'L' ? x + inset : x + width - inset, y: y + height * f }
    }
    return { x: x + width * f, y: side === 'T' ? y : y + height }
  }

  const points = scaledPoints(shape, x, y, width, height)
  const intersections: Point[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (side === 'L' || side === 'R') {
      const py = y + height * f
      if (Math.abs(a.y - b.y) < 0.001 || py < Math.min(a.y, b.y) || py > Math.max(a.y, b.y)) continue
      const t = (py - a.y) / (b.y - a.y)
      intersections.push({ x: a.x + (b.x - a.x) * t, y: py })
    } else {
      const px = x + width * f
      if (Math.abs(a.x - b.x) < 0.001 || px < Math.min(a.x, b.x) || px > Math.max(a.x, b.x)) continue
      const t = (px - a.x) / (b.x - a.x)
      intersections.push({ x: px, y: a.y + (b.y - a.y) * t })
    }
  }
  if (intersections.length) {
    if (side === 'L') return intersections.reduce((best, p) => p.x < best.x ? p : best)
    if (side === 'R') return intersections.reduce((best, p) => p.x > best.x ? p : best)
    if (side === 'T') return intersections.reduce((best, p) => p.y < best.y ? p : best)
    return intersections.reduce((best, p) => p.y > best.y ? p : best)
  }
  return { x: x + width / 2, y: y + height / 2 }
}

export function shapeSampleSvg(kind: NodeVisualKind, color: string): string {
  const shape = svgNodeShape(kind, 1.5, 1.5, 25, 15)
  const attrs = Object.entries(shape.attrs)
    .map(([name, value]) => `${name}="${value}"`)
    .join(' ')
  return `<svg class="legend-shape" width="29" height="18" viewBox="0 0 28 18" aria-hidden="true"><${shape.tag} ${attrs} fill="color-mix(in srgb, ${color} 18%, transparent)" stroke="${color}" stroke-width="1.35" stroke-linejoin="round"/></svg>`
}
