/**
 * Type augmentations for Playwright extension tests.
 * Covers non-standard browser APIs and Chrome extension globals
 * used inside page.evaluate() / sw.evaluate() callbacks.
 */

// window.find() — non-standard but supported in Chrome/Firefox
interface Window {
    find(
        aString: string,
        aCaseSensitive?: boolean,
        aBackwards?: boolean,
        aWrapAround?: boolean,
        aWholeWord?: boolean,
        aSearchInFrames?: boolean,
        aShowDialog?: boolean,
    ): boolean;
}

// chrome extension API is provided by @types/chrome (added to tsconfig types)
