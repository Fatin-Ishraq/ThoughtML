// Inline provenance for imported conclusions. A project-level reference keeps
// the imported conclusion visible, while its same-file explanatory ancestry is
// folded until the reader asks to see why that conclusion was reached.

import type { Canonical, CanonObject, SourceMap } from './model'

export interface ReasoningExpansionInfo {
  count: number
  expanded: boolean
  source: string
}

function refsOf(obj: CanonObject): string[] {
  if (obj.type === 'link') return [obj.from, obj.to]
  if (obj.type === 'stance') return [obj.target]
  if (obj.type === 'question') return obj.asks_about ?? []
  if (obj.type === 'scope') return obj.includes ?? []
  if (obj.type === 'act') return obj.expands_to ?? []
  return []
}

function projectCanonical(canon: Canonical, hidden: Set<string>): Canonical {
  if (!hidden.size) return canon
  const objects = canon.objects.flatMap((obj): CanonObject[] => {
    if (hidden.has(obj.id)) return []
    if (obj.type === 'link' && (hidden.has(obj.from) || hidden.has(obj.to))) return []
    if (obj.type === 'stance' && hidden.has(obj.target)) return []
    if (obj.type === 'question') return [{ ...obj, asks_about: obj.asks_about?.filter((id) => !hidden.has(id)) }]
    if (obj.type === 'scope') return [{ ...obj, includes: obj.includes?.filter((id) => !hidden.has(id)) }]
    if (obj.type === 'act') return [{ ...obj, expands_to: obj.expands_to?.filter((id) => !hidden.has(id)) }]
    return [obj]
  })
  return { ...canon, objects }
}

export class ReasoningExpansion {
  private ancestry = new Map<string, Set<string>>()
  private expanded = new Set<string>()
  private hidden = new Set<string>()
  private sourceMap: SourceMap = { objects: {} }

  update(canon: Canonical, sourceMap: SourceMap): void {
    this.sourceMap = sourceMap
    const byId = new Map(canon.objects.map((obj) => [obj.id, obj]))
    const sourceOf = (id: string) => sourceMap.objects[id]?.source
    const gateways = new Set<string>()

    // An endpoint referenced by an object authored in another file is the
    // imported module's public conclusion (its compact gateway in the project).
    for (const obj of canon.objects) {
      const owner = sourceOf(obj.id)
      if (!owner) continue
      for (const ref of refsOf(obj)) {
        const foreign = sourceOf(ref)
        if (foreign && foreign !== owner && byId.has(ref)) gateways.add(ref)
      }
    }

    const incoming = new Map<string, Array<{ link: string; from: string }>>()
    for (const obj of canon.objects) {
      if (obj.type !== 'link') continue
      const items = incoming.get(obj.to) ?? []
      items.push({ link: obj.id, from: obj.from })
      incoming.set(obj.to, items)
    }

    const next = new Map<string, Set<string>>()
    for (const root of gateways) {
      const source = sourceOf(root)
      if (!source) continue
      const found = new Set<string>()
      const visited = new Set<string>([root])
      const queue = [root]
      while (queue.length) {
        const target = queue.shift()!
        for (const edge of incoming.get(target) ?? []) {
          // Do not pull a parent project's connection back inside the module.
          if (sourceOf(edge.link) !== source || sourceOf(edge.from) !== source) continue
          found.add(edge.link)
          if (edge.from !== root) found.add(edge.from)
          if (!visited.has(edge.from)) {
            visited.add(edge.from)
            queue.push(edge.from)
          }
        }
      }
      if (found.size) next.set(root, found)
    }

    this.ancestry = next
    this.expanded = new Set([...this.expanded].filter((id) => next.has(id)))
    this.recomputeHidden()
  }

  info(id: string): ReasoningExpansionInfo | undefined {
    const ancestry = this.ancestry.get(id)
    const source = this.sourceMap.objects[id]?.source
    if (!ancestry?.size || !source) return undefined
    return { count: ancestry.size, expanded: this.expanded.has(id), source }
  }

  toggle(id: string): boolean {
    if (!this.ancestry.has(id)) return false
    if (this.expanded.has(id)) this.expanded.delete(id)
    else this.expanded.add(id)
    this.recomputeHidden()
    return this.expanded.has(id)
  }

  project(canon: Canonical): Canonical {
    return projectCanonical(canon, this.hidden)
  }

  expandedIds(): string[] {
    return [...this.expanded]
  }

  markers(): Record<string, boolean> {
    return Object.fromEntries([...this.ancestry].map(([id]) => [id, this.expanded.has(id)]))
  }

  private recomputeHidden(): void {
    const hidden = new Set<string>()
    const revealed = new Set<string>()
    for (const [root, ancestry] of this.ancestry) {
      const target = this.expanded.has(root) ? revealed : hidden
      ancestry.forEach((id) => target.add(id))
    }
    // A shared reason stays visible while any expanded conclusion needs it.
    revealed.forEach((id) => hidden.delete(id))
    // Gateways must always remain clickable, even when they support each other.
    this.ancestry.forEach((_ancestry, root) => hidden.delete(root))
    this.hidden = hidden
  }
}
