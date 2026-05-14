/**
 * Central type definitions for the Surfingkeys project.
 * Shared interfaces used across content scripts, api, and mode system.
 */

// Build-time defines (replaced by esbuild)
declare global {
    const __CONFIG_SERVER_PORT__: string;

    // String.prototype.format extension (defined in content_scripts/common/utils.ts)
    interface String {
        format(...args: unknown[]): string;
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

export interface ModeInstance {
    name: string;
    statusLine: string;
    priority: number;
    activatedOnElement: boolean;
    mappings: {
        add(keys: string, meta: unknown): void;
        remove(keys: string): unknown;
        find(keys: string): unknown;
    };
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
