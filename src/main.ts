type UserEntry = { username: string; commends: string; steamId: string }
type WarEntry = {
  warId: string
  warden: Record<string, UserEntry>
  colonial: Record<string, UserEntry>
  winner: 'warden' | 'colonial'
  start: number
  end: number
  conquestStart: number
  conquestEnd: number
  skirmish: {
    warden: number
    colonial: number
    none: number
  }
}

type StateEventListener<T> = (evt: CustomEvent<T>) => void

interface StateEventListenerObject<T> {
  handleEvent(object: CustomEvent<T>): void
}

interface VirtualListConfig {
  w?: number
  h?: number
  items: HTMLElement[]
  itemHeight: number
  totalRows?: number
}

type StateEventListenerOrObject<T> = StateEventListener<T> | StateEventListenerObject<T>

type StateEventMap = {
  selectedWar: number
  warEntry: WarEntry
}

interface StateManager<T extends Record<string, unknown> = Record<string, unknown>> extends EventTarget {
  addEventListener<K extends keyof T>(type: K, listener: StateEventListenerOrObject<T[K]> | null): void
  dispatchEvent(event: CustomEvent<T[keyof T]>): boolean
  removeEventListener<K extends keyof T>(type: K, callback: StateEventListenerOrObject<T[K]> | null, options?: EventListenerOptions | boolean): void
}

function assertElementType<T extends HTMLElement>(element: EventTarget | null, type: new () => T): T {
  if (element === null) {
    throw new Error('Element is null')
  }

  if (!(element instanceof type)) {
    throw new Error('Element is not the correct type')
  }

  return element
}

function findDOMElement<T extends HTMLElement = HTMLElement>(node: HTMLElement, query: string, element: new () => T): T {
  return assertElementType(node.ownerDocument.querySelector(query), element)
}

const cachedWars = new Map<number, WarEntry>()

const stateManager = new EventTarget() as StateManager<StateEventMap>

function loadWarInURL() {
  const url = new URL(window.location.href)

  const urlWar = url.searchParams.get('war')

  if (urlWar === null) {
    return
  }

  const parsedWar = Number.parseInt(urlWar)

  if (Number.isNaN(parsedWar) || parsedWar > 64 || parsedWar < 1) {
    return
  }

  stateManager.dispatchEvent(new CustomEvent('selectedWar', { detail: parsedWar }))
}

class FoxholeWarSelect extends HTMLElement {
  public selector: HTMLSelectElement

  public constructor() {
    super()
    this.selector = findDOMElement(this, 'select', HTMLSelectElement)
  }

  private handleSelectChange = (event: CustomEvent<number>): void => {
    this.selector.value = event.detail.toString()
  }

  private handleChangeEvent = (event: Event): void => {
    const target = assertElementType(event.target, HTMLSelectElement)
    const value = Number.parseInt(target.value)

    stateManager.dispatchEvent(new CustomEvent('selectedWar', { detail: value }))

    const url = new URL(window.location.href)

    if (value < 0 || value > 64) {
      url.searchParams.delete('war')
    } else {
      url.searchParams.set('war', target.value)
    }

    window.history.replaceState({}, '', url)
  }

  public connectedCallback() {
    this.selector.addEventListener('change', this.handleChangeEvent)
    stateManager.addEventListener('selectedWar', this.handleSelectChange)
  }

  public disconnectedCallback() {
    this.selector.removeEventListener('change', this.handleChangeEvent)
    stateManager.removeEventListener('selectedWar', this.handleSelectChange)
  }
}

class VirtualList extends HTMLElement {
  public items: HTMLElement[]

  public totalRows: number

  public scroller: HTMLDivElement

  public width: string

  public height: string

  public itemHeight: number

  public lastRepaintY: number | undefined

  public screenItemsLen: number

  public maxBuffer: number

  public constructor(config: VirtualListConfig) {
    super()

    this.height = typeof config.h === 'number' ? `${config.h.toString()}px` : '100%'
    this.width = typeof config.w === 'number' ? `${config.w.toString()}px` : '100%'
    this.itemHeight = config.itemHeight
    this.items = config.items
    this.totalRows = config.totalRows ?? config.items.length
    this.screenItemsLen = Math.ceil(this.clientHeight / this.itemHeight)
    this.maxBuffer = this.screenItemsLen * this.itemHeight
    this.scroller = this.createScroller()
    this.appendChild(this.scroller)
    this.style.width = this.width
    this.style.height = this.height
    this.style.display = 'block'
    this.style.overflow = 'auto'
    this.style.position = 'relative'
  }

  private createScroller(): HTMLDivElement {
    const height = this.itemHeight * this.totalRows
    const scroller = this.ownerDocument.createElement('div')
    scroller.style.opacity = '0'
    scroller.style.position = 'absolute'
    scroller.style.top = '0'
    scroller.style.left = '0'
    scroller.style.width = '1px'
    scroller.style.height = `${height.toString()}px`

    return scroller
  }

  public handleEvent(event: Event): void {
    event.preventDefault()
    const travelled = this.scrollTop / this.itemHeight
    let first = Math.round(travelled - this.screenItemsLen)

    first = first < 0 ? 0 : first

    if (this.lastRepaintY === undefined || Math.abs(this.scrollTop - this.lastRepaintY) > this.maxBuffer) {
      this.renderChunk(first, this.screenItemsLen * 2.5)
      this.lastRepaintY = this.scrollTop
    }
  }

  private renderChunk(fromPos: number, howMany: number): void {
    const fragment = document.createDocumentFragment()

    fragment.appendChild(this.scroller)

    let finalItem = Math.round(fromPos + howMany)

    if (finalItem > this.totalRows) {
      finalItem = this.totalRows
    }

    for (const [index, item] of this.items.slice(fromPos, finalItem).entries()) {
      item.style.position = 'absolute'
      item.style.top = `${((index + fromPos) * this.itemHeight).toString()}px`
      fragment.appendChild(item)
    }

    this.innerHTML = ''
    this.appendChild(fragment)
  }

  public connectedCallback(): void {
    this.addEventListener('scroll', this)
    this.screenItemsLen = Math.ceil(this.clientHeight / this.itemHeight)
    this.renderChunk(0, this.screenItemsLen * 2.5)
  }

  public disconnectedCallback(): void {
    this.removeEventListener('scroll', this)
  }
}

function createNewWindowIcon(node: HTMLElement): SVGElement {
  const svgNamespace = 'http://www.w3.org/2000/svg'
  const svg = node.ownerDocument.createElementNS(svgNamespace, 'svg')
  const use = node.ownerDocument.createElementNS(svgNamespace, 'use')
  svg.ariaHidden = 'true'
  use.href.baseVal = '#new-window-icon'
  svg.appendChild(use)
  return svg
}

class FoxholePlayer extends HTMLElement {
  public static get observedAttributes() {
    return ['rank', 'username', 'steam-id', 'commends', 'actual-rank'] as const
  }

  private rank: HTMLSpanElement

  private commend: HTMLSpanElement

  private user: HTMLAnchorElement

  private newWindowIcon: SVGElement

  public constructor() {
    super()

    this.rank = this.ownerDocument.createElement('span')
    this.commend = this.ownerDocument.createElement('span')
    this.user = this.ownerDocument.createElement('a')
    this.newWindowIcon = createNewWindowIcon(this)
    this.user.referrerPolicy = 'no-referrer'
    this.user.target = '_blank'
    this.user.setAttribute('aria-describedby', 'new-win-desc')

    this.append(this.rank, this.commend, this.user)
  }

  public attributeChangedCallback(name: 'rank' | 'username' | 'steam-id' | 'commends' | 'actual-rank', _: string | null, newValue: string | null): void {
    if (name === 'rank') {
      this.rank.textContent = newValue
    } else if (name === 'username') {
      this.user.textContent = newValue
      this.user.append(this.newWindowIcon)
    } else if (name === 'commends') {
      this.commend.textContent = newValue
    } else if (name === 'steam-id') {
      this.user.href = `https://steamcommunity.com/profiles/${String(newValue)}`
    } else {
      this.rank.title = `#${String(newValue)}`
    }
  }
}

const colonialPlayerListMap = new Map<number, FoxholePlayer[]>()
const wardenPlayerListMap = new Map<number, FoxholePlayer[]>()

function getOrCreatePlayerList(users: Record<string, UserEntry>, faction: 'colonial' | 'warden', warNumber: number): FoxholePlayer[] {
  let list: FoxholePlayer[] | undefined

  if (faction === 'colonial') {
    list = colonialPlayerListMap.get(warNumber)
  } else {
    list = wardenPlayerListMap.get(warNumber)
  }

  if (list !== undefined) {
    return list
  }

  const result: FoxholePlayer[] = []
  let score = 0
  let commendCount = 999_999_999

  for (const { username, commends, steamId } of Object.values(users)) {
    const player = new FoxholePlayer()
    const playerCommends = Number.parseInt(commends)

    if (commendCount > playerCommends) {
      score++
      commendCount = playerCommends
      player.setAttribute('rank', score.toString())
    } else {
      player.setAttribute('rank', '-')
    }

    player.setAttribute('actual-rank', score.toString())
    player.setAttribute('username', username)
    player.setAttribute('commends', commends)
    player.setAttribute('steam-id', steamId)

    result.push(player)
  }

  if (faction === 'colonial') {
    colonialPlayerListMap.set(warNumber, result)
  } else {
    wardenPlayerListMap.set(warNumber, result)
  }

  return result
}

class FoxholeWarDisplay extends HTMLElement {
  public loading: HTMLDivElement

  public war: HTMLHeadingElement

  public winner: HTMLImageElement

  public start: HTMLTimeElement

  public end: HTMLTimeElement

  public short: Intl.DateTimeFormat

  public long: Intl.DateTimeFormat

  public wardenRankings: HTMLDivElement

  public colonialRankings: HTMLDivElement

  public downloadButton: HTMLAnchorElement

  public basePage: HTMLDivElement

  public colonialSearch: FoxholePlayerSearch

  public wardenSearch: FoxholePlayerSearch

  public constructor() {
    super()

    this.loading = findDOMElement(this, 'div.loading', HTMLDivElement)
    this.war = findDOMElement(this, 'h2.war', HTMLHeadingElement)
    this.winner = findDOMElement(this, 'img.winning-faction', HTMLImageElement)
    this.start = findDOMElement(this, 'time.start', HTMLTimeElement)
    this.end = findDOMElement(this, 'time.end', HTMLTimeElement)
    this.wardenRankings = findDOMElement(this, 'div.warden-rankings', HTMLDivElement)
    this.colonialRankings = findDOMElement(this, 'div.colonial-rankings', HTMLDivElement)
    this.downloadButton = findDOMElement(this, 'a.download-button', HTMLAnchorElement)
    this.basePage = findDOMElement(this, 'div.base-page', HTMLDivElement)
    this.colonialSearch = findDOMElement(this, 'foxhole-player-search.colonial-search', FoxholePlayerSearch)
    this.wardenSearch = findDOMElement(this, 'foxhole-player-search.warden-search', FoxholePlayerSearch)
    this.short = new Intl.DateTimeFormat(navigator.language)
    this.long = new Intl.DateTimeFormat(navigator.language, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    })
  }

  public connectedCallback(): void {
    stateManager.addEventListener('selectedWar', this)
    loadWarInURL()
  }

  public disconnectedCallback(): void {
    stateManager.removeEventListener('selectedWar', this)
  }

  public handleEvent(event: CustomEvent<number>): void {
    if (event.detail === 0) {
      this.basePage.hidden = false
      return
    } else {
      this.basePage.hidden = true
    }

    void (async () => {
      this.loading.hidden = false

      const cachedWar = cachedWars.get(event.detail)

      let warData: WarEntry

      const importPath = `./wars/${event.detail.toString()}.json`

      if (cachedWar === undefined) {
        warData = (await fetch(importPath).then(async (response) => await response.json())) as WarEntry
      } else {
        warData = cachedWar
      }

      this.war.textContent = `War ${event.detail.toString()}`
      const start = new Date(warData.start)
      const end = new Date(warData.conquestEnd)
      this.start.title = this.long.format(start)
      this.start.dateTime = start.toISOString()
      this.start.textContent = this.short.format(start)
      this.end.title = this.long.format(end)
      this.end.dateTime = end.toISOString()
      this.end.textContent = this.short.format(end)

      const wardenList = new VirtualList({
        itemHeight: 22,
        items: getOrCreatePlayerList(warData.warden, 'warden', event.detail)
      })

      const colonialList = new VirtualList({
        itemHeight: 22,
        items: getOrCreatePlayerList(warData.colonial, 'colonial', event.detail)
      })

      this.wardenRankings.replaceChildren(wardenList)
      this.colonialRankings.replaceChildren(colonialList)

      this.wardenSearch.virtualList = wardenList
      this.colonialSearch.virtualList = colonialList

      this.loading.hidden = true

      this.winner.src = warData.winner === 'warden' ? './logo/warden.png' : './logo/colonial.png'
      this.winner.alt = warData.winner === 'warden' ? 'Warden victory' : 'Colonial victory'

      this.downloadButton.href = importPath
    })()
  }
}

class FoxholePlayerSearch extends HTMLElement {
  private userInput: HTMLInputElement

  private resultsList: HTMLDivElement

  private _virtualList: VirtualList | undefined

  private boundInputHandler: (event: Event) => void

  private boundChangeHandler: () => void

  private boundFocusInHandler: (event: Event) => void

  public get virtualList(): VirtualList {
    if (this._virtualList === undefined) {
      throw new Error('No virtual list found')
    }
    return this._virtualList
  }

  public set virtualList(value: VirtualList) {
    this._virtualList = value
  }

  public constructor() {
    super()

    const userInput = this.querySelector('input')

    if (!(userInput instanceof HTMLInputElement)) {
      throw new Error('No input found')
    }

    const resultsList = this.querySelector('div.results')

    if (!(resultsList instanceof HTMLDivElement)) {
      throw new Error('No results found')
    }

    this.resultsList = resultsList

    this.userInput = userInput
    this.boundInputHandler = this.handleUserInput.bind(this)
    this.boundChangeHandler = this.handleSelectedWarReset.bind(this)
    this.boundFocusInHandler = this.handleFocusIn.bind(this)
  }

  private handleUserInput(event: Event): void {
    event.preventDefault()
    this.resultsList.innerHTML = ''

    if (this.userInput.value === '') {
      return
    }

    const results: { index: number; player: HTMLElement }[] = []

    for (const [index, player] of this.virtualList.items.entries()) {
      if (player.getAttribute('username')?.toLowerCase().includes(this.userInput.value.toLowerCase()) || player.getAttribute('steam-id')?.includes(this.userInput.value)) {
        results.push({ index, player })
      }
    }

    for (const { index, player } of results.slice(0, 10)) {
      const button = this.ownerDocument.createElement('button')
      button.textContent = player.getAttribute('username')
      button.type = 'button'
      this.resultsList.appendChild(button)
      button.addEventListener('click', (event) => {
        event.preventDefault()

        this.virtualList.scrollTop = index * this.virtualList.itemHeight
        this.resultsList.innerHTML = ''
        this.userInput.value = ''
      })
    }
  }

  private handleSelectedWarReset(): void {
    this.resultsList.innerHTML = ''
    this.userInput.value = ''
  }

  private handleFocusIn(event: Event): void {
    const target = event.target

    if (!(target instanceof Node) || this.contains(target)) {
      return
    }

    this.resultsList.innerHTML = ''
  }

  public connectedCallback(): void {
    this.userInput.addEventListener('input', this.boundInputHandler)
    this.ownerDocument.addEventListener('focusin', this.boundFocusInHandler)
    this.ownerDocument.addEventListener('click', this.boundFocusInHandler)
    stateManager.addEventListener('selectedWar', this.boundChangeHandler)
  }

  public disconnectedCallback(): void {
    this.userInput.removeEventListener('input', this.boundInputHandler)
    this.ownerDocument.removeEventListener('focusin', this.boundFocusInHandler)
    this.ownerDocument.removeEventListener('click', this.boundFocusInHandler)
    stateManager.removeEventListener('selectedWar', this.boundChangeHandler)
  }
}

customElements.define('foxhole-war-select', FoxholeWarSelect)
customElements.define('foxhole-player-search', FoxholePlayerSearch)
customElements.define('foxhole-war-display', FoxholeWarDisplay)
customElements.define('virtual-list', VirtualList)
customElements.define('foxhole-player', FoxholePlayer)
