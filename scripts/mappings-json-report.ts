#!/usr/bin/env bun
/**
 * Generate JSON report of all keyboard shortcuts in SurfingKeys
 *
 * Outputs structured JSON with:
 * - All keyboard mappings (mapkey, vmapkey, imapkey, etc.)
 * - Mode information (Normal, Visual, Insert, Omnibar, etc.)
 * - Annotations (both string and object formats preserved)
 * - Source file locations
 * - Summary statistics
 *
 * Usage: bun scripts/mappings-json-report.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface AnnotationObject {
    short?: string;
    unique_id?: string;
    feature_group?: number;
    category?: string;
    description?: string;
    tags?: string[];
}

interface MappingEntry {
    key: string;
    mode: string;
    annotation: string | AnnotationObject;
    source: {
        file: string;
        line: number;
    };
    mappingType: 'mapkey' | 'direct' | 'search_alias' | 'command';
}

interface Summary {
    total: number;
    by_mode: Record<string, number>;
    by_type: Record<string, number>;
    migrated: number;
    not_migrated: number;
}

interface Report {
    mappings: MappingEntry[];
    summary: Summary;
}

// ============================================================================
// MODE MAPPINGS
// ============================================================================

const MODE_MAP: Record<string, string> = {
    'mapkey': 'Normal',
    'vmapkey': 'Visual',
    'imapkey': 'Insert',
    'cmapkey': 'Omnibar',
    'command': 'Command'
};

// ============================================================================
// PATTERN EXTRACTORS
// ============================================================================

/**
 * Parse mapkey/vmapkey/imapkey/cmapkey patterns
 * Handles both string and object annotations
 */
function parseMapkeyPatterns(
    content: string,
    relPath: string,
    mappings: MappingEntry[]
): void {
    const patterns = ['mapkey', 'vmapkey', 'imapkey', 'cmapkey'];

    for (const pattern of patterns) {
        // Match: mapkey('key', annotation, ...)
        // Annotation can be string or object
        const regex = new RegExp(
            `${pattern}\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]\\s*,\\s*([\\s\\S]*?)\\)\\s*;`,
            'g'
        );

        let match;
        while ((match = regex.exec(content)) !== null) {
            const key = match[1];
            const callBody = match[2];
            const lineNum = content.substring(0, match.index).split('\n').length;

            let annotation: string | AnnotationObject;

            // Try to parse as object annotation first
            const objMatch = callBody.match(/^\s*\{([\s\S]*?)\}\s*,/);
            if (objMatch) {
                // Object annotation
                const objBody = objMatch[1];
                const annotationObj: AnnotationObject = {};

                // Extract fields
                const shortMatch = objBody.match(/short\s*:\s*["']([^"']+)["']/);
                if (shortMatch) annotationObj.short = shortMatch[1];

                const uniqueIdMatch = objBody.match(/unique_id\s*:\s*["']([^"']+)["']/);
                if (uniqueIdMatch) annotationObj.unique_id = uniqueIdMatch[1];

                const featureGroupMatch = objBody.match(/feature_group\s*:\s*(\d+)/);
                if (featureGroupMatch) annotationObj.feature_group = parseInt(featureGroupMatch[1]);

                const categoryMatch = objBody.match(/category\s*:\s*["']([^"']+)["']/);
                if (categoryMatch) annotationObj.category = categoryMatch[1];

                const descMatch = objBody.match(/description\s*:\s*["']([^"']+)["']/);
                if (descMatch) annotationObj.description = descMatch[1];

                const tagsMatch = objBody.match(/tags\s*:\s*\[([\s\S]*?)\]/);
                if (tagsMatch) {
                    const tagsStr = tagsMatch[1];
                    annotationObj.tags = tagsStr.match(/["']([^"']+)["']/g)?.map(t => t.slice(1, -1)) || [];
                }

                annotation = annotationObj;
            } else {
                // String annotation
                const stringMatch = callBody.match(/^['"`]([^'"`]*)['"`]/);
                if (stringMatch) {
                    annotation = stringMatch[1];
                } else {
                    continue; // Skip if no annotation found
                }
            }

            const mode = MODE_MAP[pattern] || 'Normal';
            mappings.push({
                key,
                mode,
                annotation,
                source: { file: relPath, line: lineNum },
                mappingType: 'mapkey'
            });
        }
    }
}

/**
 * Parse mode.mappings.add() patterns (direct Trie additions)
 * Used in insert.js, omnibar.js, hints.js, cursorPrompt.js, normal.js
 */
function parseMappingsAddPatterns(
    content: string,
    relPath: string,
    mappings: MappingEntry[]
): void {
    // Match: self.mappings.add(KeyboardUtils.encodeKeystroke('key'), {annotation: ..., ...})
    // Match: self.mappings.add("encodedKey", {annotation: ..., ...})

    const regex = /self\.mappings\.add\s*\(\s*(?:KeyboardUtils\.encodeKeystroke\s*\(\s*)?['"]([^'"]+)['"]\)?\s*,\s*\{([\s\S]*?)\}\s*\)/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
        const key = match[1];
        const objectBody = match[2];
        const lineNum = content.substring(0, match.index).split('\n').length;

        // Extract annotation
        let annotation: string | AnnotationObject;

        // Check for object annotation first
        const annotationObjMatch = objectBody.match(/annotation\s*:\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/);
        if (annotationObjMatch) {
            const annotationBody = annotationObjMatch[1];
            const annotationObj: AnnotationObject = {};

            const shortMatch = annotationBody.match(/short\s*:\s*["']([^"']+)["']/);
            if (shortMatch) annotationObj.short = shortMatch[1];

            const uniqueIdMatch = annotationBody.match(/unique_id\s*:\s*["']([^"']+)["']/);
            if (uniqueIdMatch) annotationObj.unique_id = uniqueIdMatch[1];

            const featureGroupMatch = objectBody.match(/feature_group\s*:\s*(\d+)/);
            if (featureGroupMatch) annotationObj.feature_group = parseInt(featureGroupMatch[1]);

            annotation = annotationObj;
        } else {
            // String annotation
            const stringMatch = objectBody.match(/annotation\s*:\s*["']([^"']+)["']/);
            if (stringMatch) {
                annotation = stringMatch[1];
            } else {
                continue; // Skip if no annotation
            }
        }

        // Determine mode from file path
        let mode = 'Normal';
        if (relPath.includes('insert.js')) mode = 'Insert';
        else if (relPath.includes('omnibar.js')) mode = 'Omnibar';
        else if (relPath.includes('hints.js')) mode = 'Hints';
        else if (relPath.includes('cursorPrompt.js')) mode = 'CursorPrompt';

        mappings.push({
            key,
            mode,
            annotation,
            source: { file: relPath, line: lineNum },
            mappingType: 'direct'
        });
    }
}

/**
 * Parse command() patterns
 */
function parseCommandPatterns(
    content: string,
    relPath: string,
    mappings: MappingEntry[]
): void {
    // Match: command('name', 'description', ...)
    const regex = /command\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
        const name = match[1];
        const description = match[2];
        const lineNum = content.substring(0, match.index).split('\n').length;

        mappings.push({
            key: name,
            mode: 'Command',
            annotation: description,
            source: { file: relPath, line: lineNum },
            mappingType: 'command'
        });
    }
}

/**
 * Parse addSearchAlias() and expand into individual mappings
 * Each search alias creates multiple key bindings
 */
function parseSearchAliasPatterns(
    content: string,
    relPath: string,
    mappings: MappingEntry[]
): void {
    // Match: addSearchAlias(alias, prompt, search_url, search_leader_key, ...)
    const regex = /addSearchAlias\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
        const alias = match[1];
        const prompt = match[2];
        const searchUrl = match[3];
        const searchLeaderKey = match[4];
        const lineNum = content.substring(0, match.index).split('\n').length;

        const annotation = `Search ${prompt}`;

        // Generate individual mappings created by addSearchAlias
        // 1. <searchLeaderKey><alias> - Search selected text
        mappings.push({
            key: `${searchLeaderKey}${alias}`,
            mode: 'Visual',
            annotation: `${annotation} (selected text)`,
            source: { file: relPath, line: lineNum },
            mappingType: 'search_alias'
        });

        // 2. o<alias> - Open omnibar for search
        mappings.push({
            key: `o${alias}`,
            mode: 'Normal',
            annotation: `${annotation} (omnibar)`,
            source: { file: relPath, line: lineNum },
            mappingType: 'search_alias'
        });

        // 3. <searchLeaderKey>o<alias> - Search only this site
        if (searchLeaderKey !== 's') {
            mappings.push({
                key: `${searchLeaderKey}o${alias}`,
                mode: 'Normal',
                annotation: `${annotation} (this site only)`,
                source: { file: relPath, line: lineNum },
                mappingType: 'search_alias'
            });
        }

        // 4. Uppercase variant if different from lowercase
        if (alias !== alias.toUpperCase()) {
            mappings.push({
                key: `${searchLeaderKey}${alias.toUpperCase()}`,
                mode: 'Visual',
                annotation: `${annotation} (selected, uppercase variant)`,
                source: { file: relPath, line: lineNum },
                mappingType: 'search_alias'
            });
        }
    }
}

// ============================================================================
// FILE SCANNER
// ============================================================================

function scanDirectory(dir: string, basePath: string, mappings: MappingEntry[]): void {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filepath = path.join(dir, file);
        const stat = fs.statSync(filepath);

        if (stat.isDirectory()) {
            scanDirectory(filepath, basePath, mappings);
        } else if (file.endsWith('.js') || file.endsWith('.ts')) {
            const content = fs.readFileSync(filepath, 'utf-8');
            const relPath = path.relative(basePath, filepath);

            // Parse all patterns
            parseMapkeyPatterns(content, relPath, mappings);
            parseMappingsAddPatterns(content, relPath, mappings);
            parseCommandPatterns(content, relPath, mappings);
            parseSearchAliasPatterns(content, relPath, mappings);
        }
    }
}

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

function generateSummary(mappings: MappingEntry[]): Summary {
    const summary: Summary = {
        total: mappings.length,
        by_mode: {},
        by_type: {},
        migrated: 0,
        not_migrated: 0
    };

    for (const mapping of mappings) {
        // Count by mode
        summary.by_mode[mapping.mode] = (summary.by_mode[mapping.mode] || 0) + 1;

        // Count by type
        summary.by_type[mapping.mappingType] = (summary.by_type[mapping.mappingType] || 0) + 1;

        // Count migration status
        if (typeof mapping.annotation === 'object' && mapping.annotation.unique_id) {
            summary.migrated++;
        } else {
            summary.not_migrated++;
        }
    }

    return summary;
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
    const srcDir = path.join(__dirname, '..', 'src');
    const mappings: MappingEntry[] = [];

    // Scan all source files
    scanDirectory(srcDir, srcDir, mappings);

    // Sort by mode, then by key
    mappings.sort((a, b) => {
        if (a.mode !== b.mode) return a.mode.localeCompare(b.mode);
        return a.key.localeCompare(b.key);
    });

    // Generate summary
    const summary = generateSummary(mappings);

    // Create report
    const report: Report = {
        mappings,
        summary
    };

    // Output JSON
    console.log(JSON.stringify(report, null, 2));
}

main();
