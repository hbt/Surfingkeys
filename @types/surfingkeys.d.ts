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
        onclick: ((this: Element, ev: MouseEvent) => any) | null;
        onchange: ((this: Element, ev: Event) => any) | null;
        onblur: ((this: Element, ev: FocusEvent) => any) | null;
        onfocus: ((this: Element, ev: FocusEvent) => any) | null;
        blur(): void;
        innerText: string;
        disabled: boolean;
        checked: boolean;
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

export type MagicDirection =
    | 'CurrentTab'
    | 'DirectionRight'
    | 'DirectionRightInclusive'
    | 'DirectionLeft'
    | 'DirectionLeftInclusive'
    | 'AllExceptActive'
    | 'AllInWindow'
    | 'AllExceptActiveAllWindows'
    | 'ChildrenTabs'
    | 'ChildrenTabsRecursively'
    | 'AllOtherWindowsTabs'
    | 'OtherWindowsNoPinned'
    | 'AllIncognitoTabs';

export interface MagicPendingContext {
    pendingMap: (key: string) => void;
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
    bookmarkFolders?: Record<string, string>;
    bookmarkMagicKeys?: Record<string, string>;
    magicKeys?: Record<string, MagicDirection>;
}

export interface MapKeyAnnotation {
    short: string;
    unique_id: string;
    feature_group?: number;
    category?: string;
    description?: string;
    tags?: string[];
}

export interface CommandRegistryEntry {
    code: () => void;
    annotation: MapKeyAnnotation;
    feature_group?: number;
    originalKey: string;
    mode: string;
    modeRef: ModeInstance;
    repeatIgnore?: boolean;
}

export interface MapKeyOptions {
    domain?: RegExp;
    repeatIgnore?: boolean;
    unique_id?: string;
}

export interface TrieNode {
    stem?: string;
    meta?: unknown;
    find(word: string): TrieNode | undefined;
    add(word: string, meta: unknown): void;
    remove(word: string): TrieNode | undefined;
    getMetas(criterion: (meta: unknown) => boolean): unknown[];
}

export interface ModeInstance {
    name: string;
    statusLine: string;
    priority: number;
    activatedOnElement: boolean;
    mappings: TrieNode;
    map_node?: TrieNode | null;
    addEventListener(evtName: string, handler: (event: KeyboardEvent) => void): ModeInstance;
    enter(priority?: number, reentrant?: boolean): number;
    exit(peek?: boolean): void;
    onEnter?(): void;
    onExit?(pos: number): void;
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
    addSearchAlias(alias: string, prompt: string, url: string, searchLeaderKey?: string, suggestionUrl?: string, callbackToParseSuggestions?: (response: string) => string[]): void;
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
    | { action: 'moveToWindowMagic'; repeats?: number; direction?: string; magic?: MagicDirection }
    | { action: 'copyTabUrlsMagic'; repeats?: number; direction?: string; magic?: MagicDirection }
    | { action: 'reloadTab'; repeats?: number; nocache?: boolean }
    | { action: 'setZoom'; zoomFactor?: number }
    | { action: 'focusTabByIndex'; repeats?: number }
    | { action: 'closeTabMagic'; repeats?: number; magic?: MagicDirection }
    | { action: 'reloadTabMagic'; repeats?: number; magic?: MagicDirection }
    | { action: 'pinTabMagic'; repeats?: number; magic?: MagicDirection }
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
    | { action: 'userLog'; message: string; level?: string }
    | { action: 'bookmarkToggleFolder'; folder: string };

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

// Message type for bookmark handlers that carry folder/repeat/magic fields
export interface BookmarkMsg {
    folder: string;
    reverse?: boolean;
    repeats?: number;
    magic?: string;
}
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

// chrome-types (official Google package) omits runtime.lastError as deprecated,
// but it still exists in Chrome. Re-declare it so existing callback-style code compiles.
declare global {
    namespace chrome {
        namespace runtime {
            const lastError: { message?: string } | undefined;
        }
    }
}

declare global {
    var _isConfigReady: (() => Promise<boolean>) | undefined;
    var _configLoadError: Error | undefined;
    var _snippetSyncChain: Promise<void> | undefined;
    var __CDP_MESSAGE_BRIDGE__: {
        dispatch(action: string, payload?: unknown, expectResponse?: boolean): unknown;
        listActions(): string[];
    } | undefined;
}
