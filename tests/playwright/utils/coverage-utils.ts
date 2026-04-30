import * as fs from 'fs';
import type { ServiceWorkerCoverage } from './cdp-coverage';

export type CoverageStats = {
    total: number;
    zero: number;
    gt0: number;
    byFunction: Map<string, number>;
};

export function coverageSlug(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

export function readCoverageStats(
    filePath: string,
    expectedTarget: 'service_worker' | 'page',
    scriptFile: 'background.js' | 'content.js',
    opts?: { allowMissingScript?: boolean },
): CoverageStats {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (payload.target !== expectedTarget) {
        throw new Error(`Expected coverage target ${expectedTarget}, got ${payload.target} for ${filePath}`);
    }

    const scriptEntries = (payload.result ?? []).filter((entry: any) =>
        typeof entry.url === 'string' && entry.url.endsWith(scriptFile),
    );
    if (scriptEntries.length === 0) {
        if (opts?.allowMissingScript) {
            return { total: 0, zero: 0, gt0: 0, byFunction: new Map<string, number>() };
        }
        throw new Error(`No ${scriptFile} entry found in ${filePath}`);
    }

    const byFunction = new Map<string, number>();
    let total = 0;
    let zero = 0;
    let gt0 = 0;

    for (const script of scriptEntries) {
        for (const fn of script.functions ?? []) {
            const maxCount = Math.max(...((fn.ranges ?? []).map((range: any) => Number(range.count) || 0)));
            total += 1;
            if (maxCount > 0) gt0 += 1;
            else zero += 1;
            if (fn.functionName) {
                byFunction.set(fn.functionName, Math.max(byFunction.get(fn.functionName) ?? 0, maxCount));
            }
        }
    }

    return { total, zero, gt0, byFunction };
}

export async function flushDualCoverage(
    covBg: ServiceWorkerCoverage | undefined,
    covContent: ServiceWorkerCoverage | undefined,
    baseLabel: string,
): Promise<{
    bgPath: string | null;
    contentPath: string | null;
    bg: CoverageStats | null;
    content: CoverageStats | null;
}> {
    const bgPath = await covBg?.flush(`${baseLabel}/command_window/background`) ?? null;
    const contentPath = await covContent?.flush(`${baseLabel}/content`) ?? null;

    return {
        bgPath,
        contentPath,
        bg: bgPath ? readCoverageStats(bgPath, 'service_worker', 'background.js', { allowMissingScript: true }) : null,
        content: contentPath ? readCoverageStats(contentPath, 'page', 'content.js') : null,
    };
}

export async function withPersistedDualCoverage<T>(
    opts: {
        suiteLabel: string;
        coverageUrl: string;
        covBg: ServiceWorkerCoverage | undefined;
        initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;
        requireBackgroundHits?: boolean;
        expectedBackgroundFunctions?: string[];
    },
    testTitle: string,
    run: () => Promise<T>,
): Promise<{
    result: T;
    bgPath: string | null;
    contentPath: string | null;
    bg: CoverageStats | null;
    content: CoverageStats | null;
}> {
    const covContent = await opts.initContentCoverageForUrl?.(opts.coverageUrl);
    if (process.env.COVERAGE === 'true' && !covContent) {
        throw new Error(`Content coverage session failed to initialize for ${opts.suiteLabel}/${coverageSlug(testTitle)}`);
    }

    try {
        await opts.covBg?.snapshot();
        await covContent?.snapshot();

        const result = await run();
        const coverage = await flushDualCoverage(opts.covBg, covContent, `${opts.suiteLabel}/${coverageSlug(testTitle)}`);

        if (process.env.COVERAGE === 'true') {
            if (!coverage.bgPath || !coverage.contentPath || !coverage.bg || !coverage.content) {
                throw new Error(`Missing dual-target coverage artifacts for ${opts.suiteLabel}/${coverageSlug(testTitle)}`);
            }
            if (coverage.bg.total > 0 && coverage.bg.zero <= 0) {
                throw new Error(`Background coverage lacked uncovered functions for ${opts.suiteLabel}/${coverageSlug(testTitle)}`);
            }
            if (opts.requireBackgroundHits && coverage.bg.gt0 <= 0) {
                throw new Error(`Background coverage had no executed functions for ${opts.suiteLabel}/${coverageSlug(testTitle)}`);
            }
            if ((opts.expectedBackgroundFunctions ?? []).some((name) => (coverage.bg?.byFunction.get(name) ?? 0) <= 0)) {
                throw new Error(`Expected background function hits missing for ${opts.suiteLabel}/${coverageSlug(testTitle)}`);
            }
            if (coverage.content.total <= 0 || coverage.content.zero <= 0 || coverage.content.gt0 <= 0) {
                throw new Error(`Content coverage was trivial for ${opts.suiteLabel}/${coverageSlug(testTitle)}`);
            }
        }

        return { result, ...coverage };
    } finally {
        await covContent?.close();
    }
}
