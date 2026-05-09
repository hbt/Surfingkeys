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
    'cmd_passthrough_enter',
    'cmd_passthrough_ephemeral',
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
    // Incognito — opens new incognito window (separate context)
    'cmd_nav_incognito',
    // Neovim — requires native messaging host + nvim --headless + WebSocket + PIXI.js renderer
    'cmd_neovim_enable_input',
    'cmd_insert_neovim_editor',
    'cmd_tools_neovim',
    'cmd_tools_edit_url_neovim',
    'cmd_tools_source_neovim',
    // Emoji picker — opens native OS emoji dialog (not available in headless Chrome)
    'cmd_insert_emoji',
    // captureVisibleTab — Chrome service worker API doesn't function in headless Playwright
    'cmd_capture_full_page',
]);

const excluded = (id: string) => EXCLUDED_IDS.has(id);

interface IssueCheck {
    label: string;
    items: unknown[];
}

const checks: IssueCheck[] = [
    { label: 'annotations.invalid',                          items: issues.annotations.invalid },
    { label: 'annotations.not_migrated',                     items: issues.annotations.not_migrated },
    { label: 'tests.missing',                                items: issues.tests.missing.filter((id: string) => !excluded(id)) },
    { label: 'tests.invalid_files',                          items: issues.tests.invalid_files },
    { label: 'code_coverage.missing',                        items: issues.code_coverage.missing.filter((id: string) => !excluded(id)) },
    { label: 'source_validation.prefix_conflicts',           items: issues.source_validation.prefix_conflicts },
    { label: 'source_validation.g_placeholder_issues',       items: issues.source_validation.g_placeholder_issues },
    { label: 'config_validation.prefix_conflicts',           items: issues.config_validation.prefix_conflicts },
    { label: 'config_validation.invalid_mapcmdkey_targets',  items: issues.config_validation.invalid_mapcmdkey_targets },
];

const failed = checks.filter(c => c.items.length > 0);

if (failed.length === 0) {
    console.log('✅ No issues found.');
    process.exit(0);
}

for (const c of failed) {
    const preview = c.items.slice(0, 5);
    const more = c.items.length - preview.length;
    console.log(`\n❌ ${c.label} (${c.items.length}):`);
    console.log(JSON.stringify(preview, null, 2));
    if (more > 0) console.log(`  ... and ${more} more`);
}

process.exit(1);
