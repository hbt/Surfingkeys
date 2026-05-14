/**
 * Central type definitions for the Surfingkeys project.
 * Shared interfaces used across content scripts, api, and mode system.
 */

// Build-time defines (replaced by esbuild)
declare global {
    const __CONFIG_SERVER_PORT__: string;

    // ace editor (loaded externally)
    const ace: any;

    // String.prototype.format extension (defined in content_scripts/common/utils.ts)
    interface String {
        format(...args: unknown[]): string;
    }

    // HTMLElement extensions added by content_scripts/common/utils.ts
    interface HTMLElement {
        show(): void;
        hide(): void;
        one(evt: string, handler: (this: HTMLElement, e: Event) => void): void;
    }

    // Element extensions (querySelector results)
    interface Element {
        show(): void;
        hide(): void;
        one(evt: string, handler: (this: Element, e: Event) => void): void;
        // HTML-like properties commonly used on Element without proper cast
        style: CSSStyleDeclaration;
        value: string;
        onclick: ((this: Element, ev: MouseEvent) => unknown) | null;
        onchange: ((this: Element, ev: Event) => unknown) | null;
        onblur: ((this: Element, ev: FocusEvent) => unknown) | null;
        onfocus: ((this: Element, ev: FocusEvent) => unknown) | null;
        blur(): void;
        innerText: string;
        disabled: boolean;
        readOnly: boolean;
        checked: boolean;
        type: string;
        isContentEditable: boolean;
        offsetHeight: number;
        offsetWidth: number;
        offsetParent: Element | null;
        selectionStart: number | null;
        selectionEnd: number | null;
        setSelectionRange(start: number, end: number, direction?: string): void;
        scrollIntoViewIfNeeded?(): void;
        scrollLeft: number;
        scrollTop: number;
        scrollHeight: number;
        scrollWidth: number;
        focus(options?: FocusOptions): void;
        // Surfingkeys hint element custom properties
        link: unknown;
        label: string;
        zIndex: string;
        skColorIndex: number;
        // Surfingkeys omnibar custom properties
        uid: string;
        url: string;
        _item: unknown;
        folder_name: string;
        folderId: string;
        query: string;
        windowId: number;
        cmd: string;
        // Surfingkeys frontend custom properties
        fromSurfingKeys: boolean;
        newlyCreated?: boolean;
        enableAutoFocus: boolean;
    }

    // NodeList/NodeListOf extensions
    interface NodeList {
        show(): void;
        hide(): void;
        remove(): void;
    }

    // NodeListOf extensions
    interface NodeListOf<TNode extends Node> {
        show(): void;
        hide(): void;
        remove(): void;
    }
}

export interface SurfingKeysConf {
    autoSpeakOnInlineQuery: boolean;
    lastKeys: string[];
    blocklistPattern: RegExp | undefined;
    lurkingPattern: RegExp | undefined;
    disabledOnActiveElementPattern: RegExp | undefined;
    smartCase: boolean;
    caseSensitive: boolean;
    clickablePat: RegExp;
    clickableSelector: string;
    editableSelector: string;
    cursorAtEndOfInput: boolean;
    defaultLLMProvider: string;
    defaultSearchEngine: string;
    defaultVoice: string;
    editableBodyCare: boolean;
    enableAutoFocus: boolean;
    experiment: boolean;
    focusFirstCandidate: boolean;
    focusOnSaved: boolean;
    hintAlign: string;
    hintExplicit: boolean;
    hintShiftNonActive: boolean;
    historyMUOrder: boolean;
    language: string | undefined;
    lastQuery: string;
    modeAfterYank: string;
    nextLinkRegex: RegExp;
    digitForRepeat: boolean;
    omnibarMaxResults: number;
    omnibarHistoryCacheSize: number;
    omnibarPosition: string;
    omnibarSuggestion: boolean;
    omnibarSuggestionTimeout: number;
    omnibarTabsQuery: Record<string, unknown>;
    pageUrlRegex: RegExp[];
    prevLinkRegex: RegExp;
    repeatThreshold: number;
    richHintsForKeystroke: number;
    colorfulKeystrokeHints: boolean;
    scrollFallback: boolean;
    scrollStepSize: number;
    showModeStatus: boolean;
    showProxyInStatusBar: boolean;
    smartPageBoundary: boolean;
    smoothScroll: boolean;
    stealFocusOnLoad: boolean;
    tabIndicesSeparator: string;
    tabsThreshold: number;
    verticalTabs: boolean;
    textAnchorPat: RegExp;
    ignoredFrameHosts: string[];
    scrollFriction: number;
    aceKeybindings: string;
    caretViewport: number[];
    mouseSelectToQuery: unknown[];
    useNeovim: boolean;
    useLocalMarkdownAPI: boolean;
}

export interface MapKeyAnnotation {
    short: string;
    unique_id: string;
    feature_group?: number;
    category?: string;
    description?: string;
    tags?: string[];
}

export interface MapKeyOptions {
    domain?: RegExp;
    repeatIgnore?: boolean;
    unique_id?: string;
}

export interface TrieNode {
    meta?: Record<string, unknown>;
    getMetas?: (filter: () => boolean) => Array<Record<string, unknown>>;
    word?: string;
    [key: string]: unknown;
}

export interface TrieMappings {
    add(keys: string, meta: unknown): void;
    remove(keys: string): TrieNode | null;
    find(keys: string): TrieNode | null;
    getWords(): string[];
    meta?: {
        annotation?: unknown;
        repeatIgnore?: boolean;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface ModeInstance {
    name: string;
    statusLine: string;
    priority: number;
    activatedOnElement: boolean;
    mappings: TrieMappings;
    map_node: TrieMappings;
    addEventListener(evtName: string, handler: (event: SKKeyboardEvent) => void): ModeInstance;
    enter(priority?: number, reentrant?: boolean): number;
    exit(peek?: boolean): void;
    onEnter?(): void;
    onExit?(pos?: number): void;
    [key: string]: unknown;
}

export interface RuntimeMessage {
    action: string;
    needResponse?: boolean;
    repeats?: number;
    [key: string]: unknown;
}

export interface CommandAPI {
    mapkey(keys: string, annotation: MapKeyAnnotation | string, fn: (...args: any[]) => void, options?: MapKeyOptions): void;
    vmapkey(keys: string, annotation: MapKeyAnnotation | string, fn: (...args: any[]) => void, options?: MapKeyOptions): void;
    imapkey(keys: string, annotation: MapKeyAnnotation | string, fn: (...args: any[]) => void, options?: MapKeyOptions): void;
    map(new_keystroke: string, old_keystroke: string, domain?: RegExp | null, new_annotation?: string | MapKeyAnnotation): void;
    vmap(new_keystroke: string, old_keystroke: string, domain?: RegExp | null, new_annotation?: string | MapKeyAnnotation): void;
    cmap(new_keystroke: string, old_keystroke: string, domain?: RegExp | null, new_annotation?: string | MapKeyAnnotation): void;
    unmap(keystroke: string, domain?: RegExp): void;
    unmapAllExcept(keystrokes: string[], domain?: RegExp): void;
    mapcmdkey(keys: string, unique_id: string, options?: MapKeyOptions): void;
    addSearchAlias(alias: string, prompt: string, url: string, searchLeaderKey?: string, suggestionUrl?: string, callbackToParseSuggestions?: (response: string) => string[] | Array<{ title?: string; url?: string }>): void;
    searchSelectedWith(se: string, onlyOnce?: boolean, query?: string, alias?: string): void;
    readText(text: string, tone?: number): void;
    RUNTIME(action: string, args?: Record<string, unknown> | null, callback?: (response: unknown) => void): void;
}

// The 12 repeat-background actions (typed precisely):
type RepeatAction =
    | { action: 'closeTab'; repeats?: number }
    | { action: 'nextTab'; repeats?: number }
    | { action: 'previousTab'; repeats?: number }
    | { action: 'moveTab'; repeats?: number; position?: number }
    | { action: 'moveToWindowMagic'; repeats?: number; direction?: string }
    | { action: 'copyTabUrlsMagic'; repeats?: number; direction?: string }
    | { action: 'reloadTab'; repeats?: number; nocache?: boolean }
    | { action: 'setZoom'; zoomFactor?: number }
    | { action: 'focusTabByIndex'; repeats?: number }
    | { action: 'closeTabMagic'; repeats?: number; magic?: string }
    | { action: 'reloadTabMagic'; repeats?: number; magic?: string }
    | { action: 'tabGotoIndex'; repeats?: number };

// 13 common query/mutation actions:
type NamedAction =
    | { action: 'getTabs'; queryInfo?: Record<string, unknown>; filter?: string; tabsThreshold?: number }
    | { action: 'getHistory'; query?: string; max_results?: number }
    | { action: 'getBookmarks'; query?: string }
    | { action: 'createBookmark'; url: string; title?: string; path?: string }
    | { action: 'removeBookmark'; url: string }
    | { action: 'openNewtab'; url?: string; active?: boolean }
    | { action: 'openLink'; url: string; tab?: Record<string, unknown> }
    | { action: 'updateSettings'; settings: Record<string, unknown> }
    | { action: 'getSettings' }
    | { action: 'toggleBlocklist'; url?: string }
    | { action: 'read'; text: string; tone?: number }
    | { action: 'getTopURL' }
    | { action: 'userLog'; message: string; level?: string };

// Catch-all for the remaining actions:
type UnknownAction = { action: string; [key: string]: unknown };

export type RuntimeAction = (RepeatAction | NamedAction | UnknownAction) & {
    needResponse?: boolean;
    repeats?: number;
};

// GitHub Gist API
export interface GistFile { content: string; filename: string; }
export interface GistObject {
    id: string;
    description?: string;
    files: Record<string, GistFile>;
}
export interface GistComment { id: number; body: string; }

// Internal data structures
export interface ScrollPositionData { scrollLeft: number; scrollTop: number; }
export interface BookmarkFolder { id: string; title: string; }
export interface LLMClientRequest { tabId: number; frameId: number; }

// Message handler type
export type MessageHandler = (
    message: RuntimeAction,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
) => unknown;

// Tab URL tracking: tabId -> { url -> title }
export type TabURLMap = Record<number, Record<string, string>>;
// Tab message tracking: tabId -> scroll position
export type TabMessageMap = Record<number, ScrollPositionData>;

// LLM client function signature
export type LLMClientFn = (request: Record<string, unknown>, opts: {
    onComplete: (message: Record<string, unknown>) => void;
    onChunk: (chunk: string) => void;
}) => void;

export type LLMClientsMap = Record<string, LLMClientFn>;

declare global {
    var _isConfigReady: (() => Promise<boolean>) | undefined;
    var _configLoadError: Error | undefined;
    var _snippetSyncChain: Promise<void> | undefined;
    var __CDP_MESSAGE_BRIDGE__: {
        dispatch(action: string, payload?: unknown, expectResponse?: boolean): unknown;
        listActions(): string[];
    } | undefined;
}

// ─── SK Keyboard Event ────────────────────────────────────────────────────────
/** KeyboardEvent extended by SurfingKeys with additional properties */
export interface SKKeyboardEvent extends KeyboardEvent {
    sk_keyName: string;
    sk_suppressed?: boolean;
    sk_stopPropagation?: boolean;
}

// ─── Mode types ───────────────────────────────────────────────────────────────
/** Constructor type for the Mode class */
export interface ModeConstructor {
    new(name: string, statusLine?: string): ModeInstance;
    handleMapKey(key: string): boolean;
    showStatus(): void;
    isSpecialKeyOf(key: string, specialKey: string): boolean;
    init(): void;
    stack(): ModeInstance[];
}

// ─── Trie constructor ─────────────────────────────────────────────────────────
/** Constructor type for the Trie class (plain function constructor) */
export interface TrieConstructor {
    new(...args: unknown[]): TrieMappings;
}

// ─── Hints module ─────────────────────────────────────────────────────────────
export type HintCallback = (element: Element | [Node, number, string], shiftKey: boolean) => void;

export interface HintsModule {
    create(cssSelector: string | RegExp | Element[], callback: ((element: Element | [Node, number, string], shiftKey?: boolean) => void) | null, attrs?: Record<string, unknown>): Promise<number>;
    createInputLayer(): void;
    dispatchMouseClick(element: Element | [Node, number, string], shiftKey?: boolean): void;
    click(links: string | Element[], force?: boolean): void;
    style(css: string, mode?: string): void;
    setCharacters(chars: string): void;
    setNumeric(): void;
    getSelector?(): string | RegExp | Element[];
}

// ─── Clipboard manager ────────────────────────────────────────────────────────
export interface ClipboardResponse {
    data: string;
}

export interface ClipboardManager {
    write(text: string): void;
    read(callback: (response: ClipboardResponse) => void): void;
}

// ─── Front API ────────────────────────────────────────────────────────────────
export interface FrontCommand {
    action: string;
    toFrontend?: boolean;
    origin?: string;
    id?: string;
    ack?: boolean;
    [key: string]: unknown;
}

export interface FrontAPI {
    command(args: FrontCommand): void;
    showEditor(element: string | Element, callback?: ((text: string) => void) | null, type?: string | null, useNeovim?: boolean): void;
    showBanner(msg: string, timeout?: number): void;
    showPopup(content: string): void;
    hidePopup(): void;
    openOmnibar?(args: Record<string, unknown>): void;
    addSearchAlias?(alias: string, prompt: string, url: string, suggestionURL?: string, listSuggestion?: ((response: string, request?: Record<string, string>) => string[] | Promise<string[]>) | null, options?: Record<string, unknown>): void;
    removeSearchAlias?(alias: string): void;
    setHintsCharacters?(chars: string): void;
    executeCommand?(cmd: string): void;
    registerInlineQuery?(): void;
    showUsage?(): void;
    getUsage?(cb: (data: unknown) => void): void;
    performInlineQuery?(query: string, pos: Record<string, number>, callback: (pos: Record<string, number>, result: unknown) => void): void;
}

// ─── Browser adapter ─────────────────────────────────────────────────────────
export interface BrowserAdapter {
    RUNTIME(action: string, args?: Record<string, unknown>, callback?: (response: unknown) => void): void;
    readText(textOrCallback: string | ((text: string) => void)): void;
}

// ─── LLM types ────────────────────────────────────────────────────────────────
export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LLMProvider {
    name: string;
    models: string[];
    apiKey?: string;
    baseUrl?: string;
}

// ─── Omnibar types ────────────────────────────────────────────────────────────
export interface OmnibarItem {
    title: string;
    url?: string;
    [key: string]: unknown;
}

export interface OmnibarHandler {
    onEnter(item: OmnibarItem, ctrlKey: boolean, shiftKey: boolean): void;
    onInput?(text: string): void;
    onTabKey?(text: string): void;
}

// ─── Inline query config ─────────────────────────────────────────────────────
export interface InlineQueryConfig {
    url: string | ((query: string) => string);
    headers?: Record<string, string>;
    parseResult: (res: string) => string | string[];
}

// ─── Command registrar ────────────────────────────────────────────────────────
export type CommandRegistrar = (
    id: string,
    annotation: MapKeyAnnotation | string,
    handler: (args: string[]) => boolean | void
) => void;

// ─── Normal mode module ───────────────────────────────────────────────────────
export interface NormalModule {
    feedkeys(keys: string): void;
    refreshScrollableElements(): Element[];
    addVIMark(mark: string): void;
    jumpVIMark(mark: string): void;
    highlightElement(element: Element): void;
    rotateFrame(): void;
    [key: string]: unknown;
}

// ─── Visual mode module ───────────────────────────────────────────────────────
export interface VisualModule {
    toggle(mode?: string): void;
    restore(): void;
    star(): void;
    feedkeys(keys: string): void;
    next(backward: boolean): void;
    getCursorPixelPos(): { top: number; left: number; height: number; width: number };
    [key: string]: unknown;
}

// ─── Insert mode module ───────────────────────────────────────────────────────
export interface InsertModule {
    exit(): void;
    [key: string]: unknown;
}

// ─── Extended Front API ───────────────────────────────────────────────────────
/** Full FrontAPI including omnibar and tab methods available in command files */
export interface FrontendAPI extends FrontAPI {
    openOmnibar(args: Record<string, unknown>): void;
    openOmniquery(args: { query: string; style?: string }): void;
    chooseTab(): void;
    groupTab(): void;
    toggleStatus(on: boolean): void;
    showUsage(): void;
    performInlineQuery(
        query: string,
        pos: Record<string, number>,
        callback: (pos: Record<string, number>, result: unknown) => void
    ): void;
}

// ─── Chrome surfingkeys extension ─────────────────────────────────────────────
/** Extended chrome namespace for Surfingkeys-native builds that expose extra APIs */
export interface ChromeSurfingkeysAPI {
    sendMouseEvent(type: number, x: number, y: number, flags: number): void;
    translateCurrentPage(): void;
}

// ─── RUNTIME function with repeats ────────────────────────────────────────────
export interface RuntimeFunction {
    (action: string, args?: Record<string, unknown> | null, callback?: (response: Record<string, unknown>) => void): void;
    repeats: number;
}
