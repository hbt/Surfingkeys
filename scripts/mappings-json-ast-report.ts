#!/usr/bin/env bun
/**
 * Generate JSON report of all keyboard shortcuts in SurfingKeys (AST-based version)
 *
 * This script uses AST parsing with @babel/parser instead of regex to extract mappings.
 * It produces IDENTICAL JSON output to the regex-based mappings-json-report.ts script.
 *
 * Outputs structured JSON with:
 * - All keyboard mappings (mapkey, vmapkey, imapkey, etc.)
 * - Mode information (Normal, Visual, Insert, Omnibar, etc.)
 * - Annotations (both string and object formats preserved)
 * - Source file locations
 * - Summary statistics
 *
 * Usage: bun scripts/mappings-json-ast-report.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface AnnotationObject {
    short: string;
    unique_id: string;
    category: string;
    description: string;
    tags: string[]; // Must have at least one tag
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
    feature_group?: number;
    repeatIgnore?: boolean;
    validationStatus?: 'valid' | 'invalid' | 'not_migrated';
    validationErrors?: string[];
}

interface Summary {
    total: number;
    by_mode: Record<string, number>;
    by_type: Record<string, number>;
    migrated: number;
    not_migrated: number;
    validation: {
        valid: number;
        invalid: number;
        not_migrated: number;
    };
}

interface Report {
    mappings: MappingEntry[];
    summary: Summary;
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateAnnotation(annotation: string | AnnotationObject): {
    status: 'valid' | 'invalid' | 'not_migrated';
    errors: string[];
} {
    // String annotations are considered not migrated
    if (typeof annotation === 'string') {
        return {
            status: 'not_migrated',
            errors: ['Annotation is still a string, not migrated to object format']
        };
    }

    const errors: string[] = [];

    // Check required fields
    if (!annotation.short) {
        errors.push('Missing required field: short');
    }
    if (!annotation.unique_id) {
        errors.push('Missing required field: unique_id');
    }
    if (!annotation.category) {
        errors.push('Missing required field: category');
    }
    if (!annotation.description) {
        errors.push('Missing required field: description');
    }
    if (!annotation.tags || !Array.isArray(annotation.tags) || annotation.tags.length === 0) {
        errors.push('Missing required field: tags (must be a non-empty array)');
    }

    return {
        status: errors.length === 0 ? 'valid' : 'invalid',
        errors
    };
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
// AST HELPER FUNCTIONS
// ============================================================================

/**
 * Extract the value from an AST node
 * Handles strings, numbers, booleans, objects, and arrays
 */
function extractValue(node: any): any {
    if (!node) return undefined;

    if (t.isStringLiteral(node)) {
        return node.value;
    }
    if (t.isNumericLiteral(node)) {
        return node.value;
    }
    if (t.isBooleanLiteral(node)) {
        return node.value;
    }
    if (t.isTemplateLiteral(node)) {
        // Handle template literals with no expressions
        if (node.expressions.length === 0 && node.quasis.length === 1) {
            return node.quasis[0].value.cooked;
        }
        return undefined; // Complex template literals not supported
    }
    if (t.isObjectExpression(node)) {
        const obj: any = {};
        for (const prop of node.properties) {
            if (t.isObjectProperty(prop) && !prop.computed) {
                let key: string;
                if (t.isIdentifier(prop.key)) {
                    key = prop.key.name;
                } else if (t.isStringLiteral(prop.key)) {
                    key = prop.key.value;
                } else {
                    continue;
                }
                obj[key] = extractValue(prop.value);
            }
        }
        return obj;
    }
    if (t.isArrayExpression(node)) {
        return node.elements.map((elem: any) => extractValue(elem)).filter((v: any) => v !== undefined);
    }
    if (t.isNullLiteral(node)) {
        return null;
    }

    return undefined;
}

/**
 * Check if a node is a member expression matching a pattern
 * e.g., self.mappings.add or KeyboardUtils.encodeKeystroke
 */
function matchesMemberExpression(node: any, pattern: string[]): boolean {
    if (!t.isMemberExpression(node)) return false;

    const parts: string[] = [];
    let current = node;

    while (t.isMemberExpression(current)) {
        if (t.isIdentifier(current.property)) {
            parts.unshift(current.property.name);
        } else {
            return false;
        }
        current = current.object;
    }

    if (t.isIdentifier(current)) {
        parts.unshift(current.name);
    }

    return parts.join('.') === pattern.join('.');
}

// ============================================================================
// AST PATTERN EXTRACTORS
// ============================================================================

/**
 * Parse mapkey/vmapkey/imapkey/cmapkey patterns using AST
 */
function parseMapkeyPatternsAST(
    code: string,
    relPath: string,
    mappings: MappingEntry[]
): void {
    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['jsx']
        });
    } catch (e) {
        // Skip files that can't be parsed
        return;
    }

    const patterns = ['mapkey', 'vmapkey', 'imapkey', 'cmapkey'];

    traverse(ast, {
        CallExpression(path: any) {
            const callee = path.node.callee;

            // Check if it's one of the mapkey functions (direct or api.mapkey)
            let functionName: string | undefined;

            if (t.isIdentifier(callee)) {
                // Direct call: mapkey(...)
                functionName = callee.name;
            } else if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
                // Member call: api.mapkey(...) or self.mapkey(...)
                functionName = callee.property.name;
            }

            if (!functionName || !patterns.includes(functionName)) return;

            const args = path.node.arguments;
            if (args.length < 2) return;

            // Extract key (first argument)
            const key = extractValue(args[0]);
            if (typeof key !== 'string') return;

            // Extract annotation (second argument)
            const annotation = extractValue(args[1]);
            if (annotation === undefined) return; // Allow empty strings

            const lineNum = path.node.loc?.start.line || 0;
            const mode = MODE_MAP[functionName] || 'Normal';

            mappings.push({
                key,
                mode,
                annotation,
                source: { file: relPath, line: lineNum },
                mappingType: 'mapkey'
            });
        }
    });
}

/**
 * Parse mode.mappings.add() patterns (direct Trie additions) using AST
 */
function parseMappingsAddPatternsAST(
    code: string,
    relPath: string,
    mappings: MappingEntry[]
): void {
    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['jsx']
        });
    } catch (e) {
        return;
    }

    traverse(ast, {
        CallExpression(path: any) {
            const callee = path.node.callee;

            // Check for self.mappings.add
            if (!matchesMemberExpression(callee, ['self', 'mappings', 'add'])) {
                return;
            }

            const args = path.node.arguments;
            if (args.length < 2) return;

            // Extract key - can be direct string or KeyboardUtils.encodeKeystroke(string)
            let key: string | undefined;
            const firstArg = args[0];

            if (t.isStringLiteral(firstArg)) {
                key = firstArg.value;
            } else if (t.isCallExpression(firstArg)) {
                // Check for KeyboardUtils.encodeKeystroke
                if (matchesMemberExpression(firstArg.callee, ['KeyboardUtils', 'encodeKeystroke'])) {
                    const encodedArg = firstArg.arguments[0];
                    if (t.isStringLiteral(encodedArg)) {
                        key = encodedArg.value;
                    }
                }
            }

            if (!key) return;

            // Extract the object (second argument)
            const objArg = args[1];
            if (!t.isObjectExpression(objArg)) return;

            // Extract properties from the options object
            let annotation: string | AnnotationObject | undefined;
            let feature_group: number | undefined;
            let repeatIgnore: boolean | undefined;

            for (const prop of objArg.properties) {
                if (!t.isObjectProperty(prop) || prop.computed) continue;

                let propKey: string | undefined;
                if (t.isIdentifier(prop.key)) {
                    propKey = prop.key.name;
                } else if (t.isStringLiteral(prop.key)) {
                    propKey = prop.key.value;
                }

                if (propKey === 'annotation') {
                    annotation = extractValue(prop.value);
                } else if (propKey === 'feature_group') {
                    feature_group = extractValue(prop.value);
                } else if (propKey === 'repeatIgnore') {
                    repeatIgnore = extractValue(prop.value);
                }
            }

            if (annotation === undefined) return; // Allow empty strings

            // Determine mode from file path
            let mode = 'Normal';
            if (relPath.includes('insert.js')) mode = 'Insert';
            else if (relPath.includes('omnibar.js')) mode = 'Omnibar';
            else if (relPath.includes('hints.js')) mode = 'Hints';
            else if (relPath.includes('cursorPrompt.js')) mode = 'CursorPrompt';

            const lineNum = path.node.loc?.start.line || 0;

            mappings.push({
                key,
                mode,
                annotation,
                source: { file: relPath, line: lineNum },
                mappingType: 'direct',
                feature_group,
                repeatIgnore
            });
        }
    });
}

/**
 * Parse command() patterns using AST
 */
function parseCommandPatternsAST(
    code: string,
    relPath: string,
    mappings: MappingEntry[]
): void {
    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['jsx']
        });
    } catch (e) {
        return;
    }

    traverse(ast, {
        CallExpression(path: any) {
            const callee = path.node.callee;

            if (!t.isIdentifier(callee, { name: 'command' })) return;

            const args = path.node.arguments;
            if (args.length < 2) return;

            const name = extractValue(args[0]);
            const annotation = extractValue(args[1]);

            if (typeof name !== 'string') return;
            if (annotation === undefined) return;

            const lineNum = path.node.loc?.start.line || 0;

            mappings.push({
                key: name,
                mode: 'Command',
                annotation,
                source: { file: relPath, line: lineNum },
                mappingType: 'command'
            });
        }
    });
}

/**
 * Parse addSearchAlias() patterns using AST and expand into individual mappings
 */
function parseSearchAliasPatternsAST(
    code: string,
    relPath: string,
    mappings: MappingEntry[]
): void {
    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['jsx']
        });
    } catch (e) {
        return;
    }

    traverse(ast, {
        CallExpression(path: any) {
            const callee = path.node.callee;

            if (!t.isIdentifier(callee, { name: 'addSearchAlias' })) return;

            const args = path.node.arguments;
            if (args.length < 4) return;

            const alias = extractValue(args[0]);
            const prompt = extractValue(args[1]);
            const searchUrl = extractValue(args[2]);
            const searchLeaderKey = extractValue(args[3]);

            if (typeof alias !== 'string' || typeof prompt !== 'string' ||
                typeof searchUrl !== 'string' || typeof searchLeaderKey !== 'string') {
                return;
            }

            const lineNum = path.node.loc?.start.line || 0;
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
    });
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

            // Parse all patterns using AST
            parseMapkeyPatternsAST(content, relPath, mappings);
            parseMappingsAddPatternsAST(content, relPath, mappings);
            parseCommandPatternsAST(content, relPath, mappings);
            parseSearchAliasPatternsAST(content, relPath, mappings);
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
        not_migrated: 0,
        validation: {
            valid: 0,
            invalid: 0,
            not_migrated: 0
        }
    };

    for (const mapping of mappings) {
        // Count by mode
        summary.by_mode[mapping.mode] = (summary.by_mode[mapping.mode] || 0) + 1;

        // Count by type
        summary.by_type[mapping.mappingType] = (summary.by_type[mapping.mappingType] || 0) + 1;

        // Count migration status (legacy)
        if (typeof mapping.annotation === 'object' && mapping.annotation.unique_id) {
            summary.migrated++;
        } else {
            summary.not_migrated++;
        }

        // Validate annotation and update counts
        const validation = validateAnnotation(mapping.annotation);
        mapping.validationStatus = validation.status;
        if (validation.errors.length > 0) {
            mapping.validationErrors = validation.errors;
        }

        summary.validation[validation.status]++;
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
