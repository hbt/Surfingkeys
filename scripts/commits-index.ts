#!/usr/bin/env bun
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DEFAULT_OUT = join(import.meta.dir, 'commits-index.json');

interface CommitRecord {
    hash: string;
    date: string;
    subject: string;
    labels: string[];
    hashtags: string[];
}

interface CommitIndex {
    generated: string;
    total: number;
    commits: CommitRecord[];
    byLabel: Record<string, string[]>;
    byHashtag: Record<string, string[]>;
}

function extractLabels(subject: string): string[] {
    const labels: string[] = [];
    const re = /\[([^\]]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(subject)) !== null) {
        labels.push(m[1].toLowerCase().trim());
    }
    return labels;
}

function extractHashtags(body: string): string[] {
    const hashtags: string[] = [];
    const re = /#([a-zA-Z][\w-]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
        hashtags.push(m[1].toLowerCase());
    }
    return [...new Set(hashtags)];
}

function buildIndex(outPath: string): CommitIndex {
    const raw = execSync(
        'git log --format="%H|%ad|%s|%b§§§" --date=short --author="hbt" --after="2025-12-31" --before="2027-01-01"',
        { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
    );

    const records = raw.split('§§§').map(r => r.trim()).filter(Boolean);
    const commits: CommitRecord[] = [];

    for (const record of records) {
        const nlIdx = record.indexOf('\n');
        const firstLine = nlIdx === -1 ? record : record.slice(0, nlIdx);
        const body = nlIdx === -1 ? '' : record.slice(nlIdx + 1);

        const parts = firstLine.split('|');
        if (parts.length < 3) continue;

        const [hash, date, ...subjectParts] = parts;
        const subject = subjectParts.join('|').trim();

        commits.push({
            hash: hash.trim().slice(0, 12),
            date: date.trim(),
            subject,
            labels: extractLabels(subject),
            hashtags: extractHashtags(body),
        });
    }

    const byLabel: Record<string, string[]> = {};
    const byHashtag: Record<string, string[]> = {};

    for (const c of commits) {
        for (const l of c.labels) {
            (byLabel[l] ??= []).push(c.hash);
        }
        for (const h of c.hashtags) {
            (byHashtag[h] ??= []).push(c.hash);
        }
    }

    const index: CommitIndex = {
        generated: new Date().toISOString(),
        total: commits.length,
        commits,
        byLabel,
        byHashtag,
    };

    writeFileSync(outPath, JSON.stringify(index, null, 2) + '\n');
    console.log(`Built index: ${commits.length} commits → ${outPath}`);
    return index;
}

function loadIndex(outPath: string): CommitIndex {
    if (!existsSync(outPath)) {
        console.error(`Index not found: ${outPath}\nRun with --build first.`);
        process.exit(1);
    }
    return JSON.parse(readFileSync(outPath, 'utf8')) as CommitIndex;
}

function printCommits(commits: CommitRecord[]): void {
    if (commits.length === 0) {
        console.log('No matching commits.');
        return;
    }
    for (const c of commits) {
        const tags = [
            c.labels.map(l => `[${l}]`).join(''),
            c.hashtags.map(h => `#${h}`).join(' '),
        ].filter(Boolean).join(' ');
        console.log(`${c.hash}  ${c.date}  ${c.subject}${tags ? '  ' + tags : ''}`);
    }
    console.log(`\n${commits.length} commit(s)`);
}

function main(): void {
    const argv = process.argv.slice(2);

    const get = (flag: string): string | undefined => {
        const i = argv.indexOf(flag);
        return i !== -1 ? argv[i + 1] : undefined;
    };
    const has = (flag: string): boolean => argv.includes(flag);

    const outPath = get('--out') ?? DEFAULT_OUT;

    if (has('--build')) {
        buildIndex(outPath);
        return;
    }

    const index = loadIndex(outPath);

    if (has('--list-labels')) {
        const sorted = Object.entries(index.byLabel).sort((a, b) => b[1].length - a[1].length);
        for (const [label, hashes] of sorted) {
            console.log(`${String(hashes.length).padStart(4)}  [${label}]`);
        }
        console.log(`\n${sorted.length} unique label(s)`);
        return;
    }

    if (has('--list-hashtags')) {
        const sorted = Object.entries(index.byHashtag).sort((a, b) => b[1].length - a[1].length);
        for (const [tag, hashes] of sorted) {
            console.log(`${String(hashes.length).padStart(4)}  #${tag}`);
        }
        console.log(`\n${sorted.length} unique hashtag(s)`);
        return;
    }

    const labelFilter = get('--label');
    const hashtagFilter = get('--hashtag');

    if (labelFilter || hashtagFilter) {
        let results = index.commits;
        if (labelFilter) {
            const norm = labelFilter.toLowerCase();
            results = results.filter(c => c.labels.includes(norm));
        }
        if (hashtagFilter) {
            const norm = hashtagFilter.toLowerCase();
            results = results.filter(c => c.hashtags.includes(norm));
        }
        printCommits(results);
        return;
    }

    // Default: print usage
    console.log(`commits-index — query 2026 HBT commits

Build:
  bun scripts/commits-index.ts --build [--out commits-index.json]

Query:
  bun scripts/commits-index.ts --label <label>
  bun scripts/commits-index.ts --hashtag <tag>
  bun scripts/commits-index.ts --label <label> --hashtag <tag>
  bun scripts/commits-index.ts --list-labels
  bun scripts/commits-index.ts --list-hashtags

Index: ${existsSync(outPath) ? outPath : '(not built yet)'}
`);
}

main();
