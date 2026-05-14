#!/usr/bin/env bun
/// <reference types="bun-types" />
export {};
/**
 * Check how many commits in brookhong/master are not yet processed.
 *
 * A commit is considered processed if:
 *   - Its SHA is listed in upstream-excluded.json
 *   - Its subject line appears in the upstream-sync branch (cherry-pick tracking branch)
 *   - It looks like a version bump (e.g. "1.18.0")
 *
 * Fetches brookhong remote at most once per 24 h (cache stamp in .git/sk-upstream-last-fetch).
 */

import { readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const FETCH_CACHE_FILE = join(root, '.git', 'sk-upstream-last-fetch');
const FETCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface ExcludedEntry {
    sha: string;
}

interface ExcludedFile {
    excluded: ExcludedEntry[];
}

function loadExcludedShas(): Set<string> {
    try {
        const raw = readFileSync(join(root, 'upstream-excluded.json'), 'utf-8');
        const data: ExcludedFile = JSON.parse(raw);
        return new Set(data.excluded.map(e => e.sha.slice(0, 7)));
    } catch {
        return new Set();
    }
}

async function spawn(cmd: string[]): Promise<{ stdout: string; ok: boolean }> {
    const proc = Bun.spawn(cmd, {
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: root,
    });
    const [stdout, , exitCode] = await Promise.all([
        Bun.readableStreamToText(proc.stdout),
        Bun.readableStreamToText(proc.stderr),
        proc.exited,
    ]);
    return { stdout: stdout.trim(), ok: exitCode === 0 };
}

async function fetchIfStale(): Promise<void> {
    let lastFetch = 0;
    try {
        lastFetch = statSync(FETCH_CACHE_FILE).mtimeMs;
    } catch {
        // file doesn't exist — treat as never fetched
    }

    if (Date.now() - lastFetch < FETCH_CACHE_TTL_MS) return;

    process.stderr.write('⟳  Fetching brookhong remote…\n');
    const r = await spawn(['git', 'fetch', 'brookhong']);
    if (!r.ok) {
        process.stderr.write('⚠️  git fetch brookhong failed — using cached refs\n');
        return;
    }
    writeFileSync(FETCH_CACHE_FILE, '');
}

async function branchExists(branch: string): Promise<boolean> {
    const r = await spawn(['git', 'rev-parse', '--verify', branch]);
    return r.ok;
}

/** Subject lines from upstream-sync — used to detect cherry-picked commits. */
async function loadSyncSubjects(): Promise<Set<string>> {
    if (!(await branchExists('upstream-sync'))) return new Set();
    const r = await spawn(['git', 'log', 'upstream-sync', '--format=%s']);
    if (!r.ok || !r.stdout) return new Set();
    return new Set(r.stdout.split('\n').map(s => s.trim()).filter(Boolean));
}

/** Commits in brookhong/master not reachable from master (by SHA). */
async function getUpstreamCommits(): Promise<Array<{ sha: string; title: string }>> {
    const r = await spawn(['git', 'log', 'master..brookhong/master', '--format=%h\t%s']);
    if (!r.ok) throw new Error('git log failed — is brookhong remote fetched?');
    if (!r.stdout) return [];
    return r.stdout.split('\n').map(line => {
        const tab = line.indexOf('\t');
        return { sha: line.slice(0, tab), title: line.slice(tab + 1) };
    });
}

function isVersionBump(title: string): boolean {
    return /^\d+\.\d+\.\d+$/.test(title.trim());
}

async function main() {
    await fetchIfStale();

    const [excludedShas, syncSubjects, upstreamCommits] = await Promise.all([
        loadExcludedShas(),
        loadSyncSubjects(),
        getUpstreamCommits(),
    ]);

    const pending = upstreamCommits.filter(c => {
        if (excludedShas.has(c.sha)) return false;
        if (syncSubjects.has(c.title)) return false;
        if (isVersionBump(c.title)) return false;
        return true;
    });

    if (pending.length === 0) {
        console.log('✅  Up to date with brookhong/master');
    } else {
        console.log(`⚠️  Upstream lag: ${pending.length} commit(s) in brookhong/master not yet processed`);
        for (const c of pending) {
            console.log(`  ${c.sha} ${c.title}`);
        }
    }

    process.exit(0);
}

main().catch(err => {
    console.error('check-upstream error:', err.message);
    process.exit(1);
});
