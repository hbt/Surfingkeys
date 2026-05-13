/**
 * Central type definitions for the Surfingkeys project.
 * Shared interfaces used across content scripts, api, and mode system.
 */

export interface SurfingKeysConf {
    autoSpeakOnInlineQuery: boolean;
    lastKeys: string;
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
    caretViewport: unknown;
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
