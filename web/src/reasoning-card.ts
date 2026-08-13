// One explanation surface for every ThoughtML graph. A manual node selection
// and an automatic Follow moment share this shell; only their emphasis differs.
// The complete technical inspector is kept behind progressive disclosure.

import { renderDetail, kindOf, labelOf } from './detail'
import { glyph } from './icons'
import type { Canonical, CanonObject } from './model'
import type { FollowMoment } from './timeview'

export interface CardSource {
  label: string
  open?: () => void
}

export type ReasoningCardMode = 'node' | 'follow'

export interface ReasoningCardOptions {
  sourceFor?: (id: string) => CardSource | undefined
  expansionFor?: (id: string) => { count: number; expanded: boolean; source: string } | undefined
  onToggleExpansion?: (id: string) => void
  onNavigate?: (id: string) => void
  onClose?: (mode: ReasoningCardMode) => void
}

export interface ReasoningCardHandle {
  showNode(canon: Canonical, id: string, anchorX?: number): void
  showMoment(canon: Canonical, moment: FollowMoment): void
  refresh(canon: Canonical): void
  close(notify?: boolean): void
  currentId(): string | null
  mode(): ReasoningCardMode | null
  isOpen(): boolean
}

function humanize(id: string): string {
  const local = id.startsWith('agent:') ? id.slice(6) : id.split('.').at(-1) ?? id
  const text = local.replace(/[-_]+/g, ' ').trim()
  return text ? text.replace(/^./, (c) => c.toUpperCase()) : labelOf(id)
}

function semanticKind(obj: CanonObject | undefined, fallback: string): string {
  if (obj?.type === 'focus') return obj.kind ?? 'focus'
  if (obj?.type === 'stance') return obj.posture
  return obj?.type ?? fallback
}

function summaryText(obj: CanonObject | undefined, id: string): string {
  if (!obj) return id.startsWith('agent:') ? 'An actor that holds stances in this reasoning graph.' : 'This reference is not declared in the current project.'
  if ('body' in obj && obj.body) return obj.body
  if (obj.type === 'link') return `${humanize(obj.from)} ${obj.relation} ${humanize(obj.to)}.`
  if (obj.type === 'stance') return `${obj.agent} ${obj.posture} ${humanize(obj.target)}.`
  if (obj.type === 'question') return `A question about ${obj.asks_about?.map(humanize).join(', ') || 'the current reasoning'}.`
  if (obj.type === 'scope') return `A scope containing ${obj.includes?.length ?? 0} reasoning item${obj.includes?.length === 1 ? '' : 's'}.`
  return 'A structured item in this reasoning graph.'
}

function titleText(obj: CanonObject | undefined, id: string): string {
  if (obj?.type === 'link') return humanize(obj.relation)
  if (obj?.type === 'stance') return `${obj.agent} ${obj.posture}`
  return humanize(id)
}

function connectionCount(canon: Canonical, id: string): number {
  return canon.objects.filter((obj) =>
    obj.type === 'link' && (obj.from === id || obj.to === id)
      || obj.type === 'stance' && (obj.target === id || `agent:${obj.agent}` === id)
  ).length
}

function chip(text: string, tone = ''): HTMLElement {
  const el = document.createElement('span')
  el.className = `reasoning-chip${tone ? ` ${tone}` : ''}`
  el.textContent = text
  return el
}

export function createReasoningCard(container: HTMLElement, options: ReasoningCardOptions = {}): ReasoningCardHandle {
  const card = document.createElement('aside')
  card.className = 'reasoning-card'
  card.hidden = true
  card.setAttribute('aria-live', 'polite')
  card.innerHTML = `
    <div class="reasoning-card-accent"></div>
    <div class="reasoning-card-head">
      <div class="reasoning-card-kicker"><span class="reasoning-card-glyph"></span><span class="reasoning-card-kind"></span></div>
      <button class="reasoning-card-close" type="button" aria-label="Close reasoning card">×</button>
    </div>
    <div class="reasoning-card-scroll">
      <h2 class="reasoning-card-title"></h2>
      <p class="reasoning-card-copy"></p>
      <div class="reasoning-card-meta"></div>
      <p class="reasoning-card-warning" hidden></p>
      <div class="reasoning-card-actions">
        <button class="reasoning-card-source" type="button" hidden></button>
        <button class="reasoning-card-reasoning" type="button" hidden></button>
        <button class="reasoning-card-more" type="button">Explore details</button>
      </div>
      <div class="reasoning-card-details detail-body" hidden></div>
    </div>
    <div class="reasoning-card-progress" hidden><span></span></div>`
  container.appendChild(card)

  const kicker = card.querySelector('.reasoning-card-kicker') as HTMLElement
  const glyphEl = card.querySelector('.reasoning-card-glyph') as HTMLElement
  const kindEl = card.querySelector('.reasoning-card-kind') as HTMLElement
  const titleEl = card.querySelector('.reasoning-card-title') as HTMLElement
  const copyEl = card.querySelector('.reasoning-card-copy') as HTMLElement
  const metaEl = card.querySelector('.reasoning-card-meta') as HTMLElement
  const warningEl = card.querySelector('.reasoning-card-warning') as HTMLElement
  const sourceEl = card.querySelector('.reasoning-card-source') as HTMLButtonElement
  const reasoningEl = card.querySelector('.reasoning-card-reasoning') as HTMLButtonElement
  const moreEl = card.querySelector('.reasoning-card-more') as HTMLButtonElement
  const detailsEl = card.querySelector('.reasoning-card-details') as HTMLElement
  const progressEl = card.querySelector('.reasoning-card-progress') as HTMLElement
  const progressFill = progressEl.querySelector('span') as HTMLElement

  let currentCanon: Canonical | null = null
  let currentNode: string | null = null
  let currentMode: ReasoningCardMode | null = null
  let currentMoment: FollowMoment | null = null
  let expanded = false

  const setPlacement = (anchorX?: number) => {
    if (anchorX === undefined) return
    card.classList.toggle('place-left', anchorX > container.clientWidth / 2)
  }

  const sourceFor = (id: string | null) => {
    const source = id ? options.sourceFor?.(id) : undefined
    sourceEl.hidden = !source
    sourceEl.textContent = source?.label ?? ''
    sourceEl.disabled = !source?.open
    sourceEl.onclick = source?.open ?? null
  }

  const expansionFor = (id: string | null) => {
    const info = id ? options.expansionFor?.(id) : undefined
    reasoningEl.hidden = !info
    reasoningEl.textContent = info?.expanded ? 'Collapse reasoning' : 'Expand reasoning'
    reasoningEl.setAttribute('aria-pressed', String(!!info?.expanded))
    reasoningEl.title = info
      ? `${info.expanded ? 'Hide' : 'Show'} ${info.count} supporting reasoning item${info.count === 1 ? '' : 's'} from ${info.source}`
      : ''
  }

  const renderExpanded = () => {
    detailsEl.hidden = !expanded
    card.classList.toggle('expanded', expanded)
    moreEl.textContent = expanded ? 'Less detail' : 'Explore details'
    if (expanded && currentCanon && currentNode) {
      renderDetail(detailsEl, currentCanon, currentNode, (id) => {
        if (options.onNavigate) options.onNavigate(id)
        else showNode(currentCanon!, id)
      })
    }
  }

  const show = () => {
    card.hidden = false
    requestAnimationFrame(() => card.classList.add('on'))
  }

  const showNode = (canon: Canonical, id: string, anchorX?: number) => {
    currentCanon = canon
    currentNode = id
    currentMode = 'node'
    currentMoment = null
    expanded = false
    setPlacement(anchorX)
    const obj = canon.objects.find((item) => item.id === id)
    const displayKind = semanticKind(obj, kindOf(canon, id))
    card.dataset.mode = 'node'
    card.classList.remove('alert')
    kicker.classList.remove('follow')
    glyphEl.innerHTML = glyph(displayKind)
    kindEl.textContent = displayKind
    titleEl.textContent = titleText(obj, id)
    copyEl.textContent = summaryText(obj, id)
    metaEl.replaceChildren()
    if (obj && (obj.type === 'focus' || obj.type === 'link') && obj.argument_status) {
      const labels: Record<string, string> = { in: 'accepted', out: 'defeated', undecided: 'undecided' }
      metaEl.appendChild(chip(labels[obj.argument_status] ?? obj.argument_status, `status-${obj.argument_status}`))
    }
    if (obj && (obj.type === 'focus' || obj.type === 'link') && obj.derived_confidence !== undefined) {
      metaEl.appendChild(chip(`${Math.round(obj.derived_confidence * 100)}% from evidence`, 'confidence'))
    }
    const connections = connectionCount(canon, id)
    if (connections) metaEl.appendChild(chip(`${connections} connection${connections === 1 ? '' : 's'}`))
    warningEl.hidden = true
    warningEl.textContent = ''
    progressEl.hidden = true
    sourceFor(id)
    expansionFor(id)
    moreEl.hidden = !obj && !id.startsWith('agent:')
    renderExpanded()
    show()
  }

  const showMoment = (canon: Canonical, moment: FollowMoment) => {
    currentCanon = canon
    currentNode = moment.primaryId
    currentMode = 'follow'
    currentMoment = moment
    expanded = false
    card.classList.remove('place-left')
    card.dataset.mode = 'follow'
    card.classList.toggle('alert', !!moment.tension)
    kicker.classList.add('follow')
    glyphEl.innerHTML = glyph(moment.kind)
    kindEl.textContent = [moment.who, moment.kind, moment.when].filter(Boolean).join('  ·  ')
    titleEl.textContent = moment.hasSentence ? humanize(moment.handle) : moment.headline
    copyEl.textContent = moment.headline
    metaEl.replaceChildren()
    if (moment.hasSentence) metaEl.appendChild(chip(moment.handle))
    if (moment.link) metaEl.appendChild(chip(`${moment.link.rel} ${moment.link.target}`, 'relation'))
    if (moment.confidence !== null) metaEl.appendChild(chip(`${Math.round(moment.confidence * 100)}% confidence`, 'confidence'))
    if (moment.lifecycle) metaEl.appendChild(chip(moment.lifecycle === 'abandoned' ? 'dead end' : 'revised later'))
    warningEl.hidden = !moment.tension
    warningEl.textContent = moment.tension ?? ''
    progressEl.hidden = false
    progressFill.style.width = moment.total > 1 ? `${(moment.index / (moment.total - 1)) * 100}%` : '100%'
    sourceFor(moment.primaryId)
    expansionFor(null)
    moreEl.hidden = !moment.primaryId
    renderExpanded()
    show()
  }

  const close = (notify = true) => {
    if (!currentMode) return
    const closingMode = currentMode
    card.classList.remove('on')
    card.hidden = true
    card.classList.remove('expanded', 'alert')
    detailsEl.replaceChildren()
    currentMode = null
    currentNode = null
    currentMoment = null
    expanded = false
    if (notify) options.onClose?.(closingMode)
  }

  moreEl.addEventListener('click', () => {
    if (currentMode === 'follow' && currentNode) {
      options.onNavigate?.(currentNode)
      expanded = true
      renderExpanded()
      return
    }
    expanded = !expanded
    renderExpanded()
  })
  reasoningEl.addEventListener('click', () => {
    if (!currentNode) return
    options.onToggleExpansion?.(currentNode)
    expansionFor(currentNode)
  })
  card.querySelector('.reasoning-card-close')?.addEventListener('click', () => close())

  return {
    showNode,
    showMoment,
    refresh: (canon) => {
      if (!currentMode) return
      if (currentMode === 'follow' && currentMoment) showMoment(canon, currentMoment)
      else if (currentNode) showNode(canon, currentNode)
    },
    close,
    currentId: () => currentNode,
    mode: () => currentMode,
    isOpen: () => currentMode !== null,
  }
}
