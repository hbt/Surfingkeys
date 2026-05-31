#!/usr/bin/env bun
/**
 * Reads issues from mappings-json-report and exits non-zero if any are found.
 *
 * Usage:
 *   bun scripts/check-issues.ts
 */

import { spawnSync } from 'child_process';
import path from 'path';

const ROOT = path.join(import.meta.dir, '..');

const result = spawnSync('bun', ['scripts/mappings-json-report.ts'], {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024, // 16MB — report grows with bySourceFile coverage data
});

if (result.status !== 0) {
    console.error('Failed to build mappings report:');
    console.error(result.stderr);
    process.exit(1);
}

const report = JSON.parse(result.stdout);
const { issues } = report;

// Build unique_id → source file map (source.file is relative to src/)
const sourceByUid = new Map<string, string>();
for (const m of (report.mappings?.list ?? [])) {
    const uid = m.annotation?.unique_id;
    const file = m.source?.file;
    if (uid && file) sourceByUid.set(uid, file);
}

// When STAGED_FILES env var is set (pre-commit hook), scope tests.missing to
// commands whose source file is among the staged files.
const stagedRaw = process.env.STAGED_FILES;
const stagedSourceFiles = stagedRaw
    ? new Set(
        stagedRaw.split('\n')
            .map(f => f.trim())
            .filter(f => f.startsWith('src/'))
            .map(f => f.slice('src/'.length))
      )
    : null;

function scopeToStaged(ids: string[]): string[] {
    if (!stagedSourceFiles) return ids;
    return ids.filter(id => {
        const src = sourceByUid.get(id);
        return src !== undefined && stagedSourceFiles.has(src);
    });
}

// Commands excluded from tests.missing / code_coverage.missing:
// - cmd_chrome_*: Chrome internal pages (chrome://) inaccessible to Playwright
// - Global mode commands: state side-effects break parallel test suite
// - TTS/Voice: requires audio / speech synthesis API
// - Proxy: requires system proxy configuration
// - Markdown viewer: sk-internal extension page, not a standard URL
// - Quit Chrome: terminates the browser mid-test
// - LLM/AI: external API dependency
// - Incognito: opens new incognito window (separate context)
// - Neovim: requires native messaging host + nvim --headless + WebSocket
const EXCLUDED_IDS = new Set([
    // Chrome internal pages
    'cmd_chrome_about',
    'cmd_chrome_bookmarks',
    'cmd_chrome_cache',
    'cmd_chrome_close_downloads_shelf',
    'cmd_chrome_cookies',
    'cmd_chrome_downloads',
    'cmd_chrome_extensions',
    'cmd_chrome_history',
    'cmd_chrome_inspect',
    'cmd_chrome_net_internals',
    'cmd_chrome_view_source',
    // Global mode — state affects parallel test suite
    'cmd_lurk_enter_normal',
    'cmd_lurk_ephemeral_normal',
    // TTS / Voice — requires audio / speech synthesis API
    'cmd_list_voices',
    'cmd_test_voices',
    'cmd_stop_reading',
    'cmd_tools_read_text',
    // Proxy — requires system proxy configuration
    'cmd_paste_proxy',
    'cmd_proxy_copy_info',
    'cmd_proxy_toggle_site',
    'cmd_set_proxy',
    'cmd_set_proxy_mode',
    // Markdown viewer — sk-internal extension page
    'cmd_markdown_copy_html',
    'cmd_markdown_edit_source',
    'cmd_markdown_open_file',
    'cmd_markdown_switch_parser',
    'cmd_markdown_toggle_section',
    // Quit Chrome — terminates the browser
    'cmd_quit_chrome',
    'cmd_session_save_quit',
    // LLM / AI — external API dependency
    'cmd_omnibar_llm_chat',
    'cmd_visual_llm_chat',
    // Incognito — opens new incognito window (separate context) or targets incognito tabs
    // which Playwright cannot access from a regular context
    'cmd_nav_incognito',
    'cmd_tab_close_magic_incognito',
    'cmd_tab_reload_magic_incognito',
    'cmd_tab_copy_urls_magic_incognito',
    'cmd_tab_detach_magic_incognito',
    // Neovim — requires native messaging host + nvim --headless + WebSocket + PIXI.js renderer
    'cmd_neovim_enable_input',
    'cmd_insert_neovim_editor',
    'cmd_tools_neovim',
    'cmd_tools_edit_url_neovim',
    'cmd_tools_source_neovim',
    // captureVisibleTab — Chrome service worker API doesn't function in headless Playwright
    'cmd_capture_full_page',
]);

const excluded = (id: string) => EXCLUDED_IDS.has(id);

// Test files excluded from tests.invalid_files check.
// Add entries here only for intentionally non-standard filenames that cannot be matched
// to a unique_id by the static analyzer (e.g. files testing framework internals, not commands).
const EXCLUDED_INVALID_FILES = new Set<string>([]);

interface IssueCheck {
    label: string;
    items: unknown[];
    note?: string;
}

// REQUIRED — must be zero; CI fails immediately if any item is found.
const requiredChecks: IssueCheck[] = [
    { label: 'annotations.invalid',                          items: issues.annotations.invalid },
    { label: 'annotations.not_migrated',                     items: issues.annotations.not_migrated },
    { label: 'annotations.empty_key',                        items: issues.annotations.empty_key },
    { label: 'tests.missing',                                items: scopeToStaged(issues.tests.missing.filter((id: string) => !excluded(id))) },
    { label: 'tests.invalid_files',                          items: issues.tests.invalid_files.filter((f: string) => !EXCLUDED_INVALID_FILES.has(f)) },
    { label: 'source_validation.prefix_conflicts',           items: issues.source_validation.prefix_conflicts },
    { label: 'source_validation.g_placeholder_issues',       items: issues.source_validation.g_placeholder_issues },
    { label: 'config_validation.prefix_conflicts',           items: issues.config_validation.prefix_conflicts },
    { label: 'config_validation.invalid_mapcmdkey_targets',  items: issues.config_validation.invalid_mapcmdkey_targets },
];

// OPTIONAL — work-in-progress; tracked for visibility but do not fail CI.
// Goal: bring each count to 0 so it can graduate to REQUIRED.
const optionalChecks: IssueCheck[] = [
    {
        label: 'tests.missing (excluded commands)',
        items: issues.tests.missing.filter((id: string) => excluded(id)),
        note: 'write Playwright specs or confirm exclusion is permanent',
    },
    {
        label: 'code_coverage.missing',
        items: issues.code_coverage.missing.filter((id: string) => !excluded(id)),
        note: 'run tests with COVERAGE=true to collect coverage data',
    },
    {
        label: 'code_coverage.missing (excluded commands)',
        items: issues.code_coverage.missing.filter((id: string) => excluded(id)),
        note: 'run tests with COVERAGE=true once specs exist',
    },
    {
        label: 'custom_mappings.unmapped',
        items: issues.custom_mappings.unmapped,
        note: 'add bindings to ~/.surfingkeys-2026.js',
    },
    {
        label: 'config_validation.duplicate_keys',
        items: issues.config_validation.duplicate_keys,
        note: 'same key bound to multiple commands in personal config',
    },
    {
        label: 'relevant_coverage.dead_tests',
        items: issues.relevant_coverage.dead_tests,
        note: 'test passes but zero relevant functions captured — likely coverage timing or fixture issue',
    },
    {
        label: 'relevant_coverage.thin_coverage',
        items: issues.relevant_coverage.thin_coverage,
        note: 'fewer than 5 relevant functions captured — test may not exercise the command',
    },
];

const failed = requiredChecks.filter(c => c.items.length > 0);

if (failed.length === 0) {
    console.log('✅ Required checks passed.');
} else {
    for (const c of failed) {
        const preview = c.items.slice(0, 5);
        const more = c.items.length - preview.length;
        console.log(`\n❌ ${c.label} (${c.items.length}):`);
        console.log(JSON.stringify(preview, null, 2));
        if (more > 0) console.log(`  ... and ${more} more`);
    }
    process.exit(1);
}

const optionalWithItems = optionalChecks.filter(c => c.items.length > 0);
if (optionalWithItems.length > 0) {
    console.log('\n📊 Optional (work in progress — does not fail CI):');
    for (const c of optionalWithItems) {
        console.log(`  ⚠️  ${c.label}: ${c.items.length}${c.note ? `  — ${c.note}` : ''}`);
    }
}
