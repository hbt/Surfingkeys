// Shared conf defaults imported by both SW (start.ts) and content scripts (runtime.ts).
// Keys that appear in both runtime.conf and the SW conf object must be defined here
// so both sides agree on the same defaults — prevents content scripts from seeing
// `undefined` before the first settingsUpdated broadcast arrives.
export const CONF_DEFAULTS = {
    focusAfterClosed: "right" as const,
    tabsMRUOrder: true,
    showTabIndices: true,
    newTabPosition: 'right' as const,
    errorReportToServer: true,
} as const;
