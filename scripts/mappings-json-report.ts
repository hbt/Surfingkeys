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
    mapping_options?: {
        feature_group?: number;
        repeatIgnore?: boolean;
        code?: any;
        stopPropagation?: any;
        [key: string]: any;  // Allow other discovered options
    };
    runtime_options?: {
        accepts_count: boolean;
    };
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
    // Configuration options discovery
    config_options: {
        [optionName: string]: {
            count: number;
            percentage: string;
            sample_values: any[];
        };
    };
}

interface SettingUsage {
    setting: string;           // e.g., "scrollStepSize"
    type: 'runtime.conf' | 'settings';
    file: string;
    line: number;
    functionName: string;      // Function where it's used
    context: 'read' | 'write'; // Whether it's being read or written
}

interface SettingStats {
    setting: string;
    type: 'runtime.conf' | 'settings';
    count: number;
    files: Set<string>;
    functions: Set<string>;
    usages: SettingUsage[];
}

interface ExcludedSetting {
    name: string;
    reason: string;
}

interface Report {
    mappings: MappingEntry[];
    summary: Summary;
    settings: {
        summary: {
            total_usages: number;
            unique_settings: number;
            runtime_conf_settings: number;
            settings_api: number;
            excluded_count: number;
        };
        excluded: ExcludedSetting[];
        list: any[];
    };
}

// ============================================================================
// EXCLUSION LIST
// ============================================================================

/**
 * Settings that are false positives detected by the AST scanner.
 * These are not genuine configuration settings and should be excluded from reports.
 */
const EXCLUDED_SETTINGS: ExcludedSetting[] = [
    {
        name: 'hasOwnProperty',
        reason: 'Built-in JavaScript method used for property validation, not a configuration setting'
    },
    {
        name: 'k',
        reason: 'Loop variable in for...in iterations, not a literal property name (dynamic property access)'
    },
    {
        name: 'error',
        reason: 'Transient error message property for UI communication, not a user-configurable runtime setting'
    }
];

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
 * Helper function to get readable name from AST node
 */
function getNodeName(node: any): string {
    if (t.isIdentifier(node)) return node.name;
    if (t.isMemberExpression(node)) {
        const obj = getNodeName(node.object);
        const prop = t.isIdentifier(node.property) ? node.property.name : '<computed>';
        return `${obj}.${prop}`;
    }
    return '<expr>';
}

/**
 * Helper function to get call expression name
 */
function getCallExpressionName(callee: any): string {
    if (t.isIdentifier(callee)) {
        return callee.name;
    }
    if (t.isMemberExpression(callee)) {
        return getMemberExpressionName(callee);
    }
    return '<expr>';
}

/**
 * Helper function to get member expression name
 */
function getMemberExpressionName(node: any): string {
    if (t.isIdentifier(node.object) && t.isIdentifier(node.property)) {
        return `${node.object.name}.${node.property.name}`;
    }
    if (t.isMemberExpression(node.object)) {
        const objName = getMemberExpressionName(node.object);
        const propName = t.isIdentifier(node.property) ? node.property.name : '<computed>';
        return `${objName}.${propName}`;
    }
    if (t.isIdentifier(node.object)) {
        const propName = t.isIdentifier(node.property) ? node.property.name : '<computed>';
        return `${node.object.name}.${propName}`;
    }
    return '<expr>';
}

/**
 * Extract the value from an AST node
 * Handles strings, numbers, booleans, objects, arrays, functions, call expressions, identifiers, and member expressions
 */
function extractValue(node: any): any {
    if (!node) return undefined;

    // Existing literal handling
    if (t.isStringLiteral(node)) return node.value;
    if (t.isNumericLiteral(node)) return node.value;
    if (t.isBooleanLiteral(node)) return node.value;
    if (t.isNullLiteral(node)) return null;

    if (t.isTemplateLiteral(node)) {
        if (node.expressions.length === 0 && node.quasis.length === 1) {
            return node.quasis[0].value.cooked;
        }
        return undefined;
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
                } else if (t.isNumericLiteral(prop.key)) {
                    key = String(prop.key.value);
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

    // NEW: Handle function expressions
    if (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
        return '<Function>';
    }

    // NEW: Handle call expressions (e.g., bindScrollForHints("down"))
    if (t.isCallExpression(node)) {
        const calleeName = getCallExpressionName(node.callee);
        const args = node.arguments.map(arg => {
            const val = extractValue(arg);
            if (val !== undefined && typeof val !== 'object') {
                return JSON.stringify(val);
            }
            return '<expr>';
        }).join(', ');
        return `<CallExpression: ${calleeName}(${args})>`;
    }

    // NEW: Handle identifiers (variable references)
    if (t.isIdentifier(node)) {
        return `<Identifier: ${node.name}>`;
    }

    // NEW: Handle member expressions (e.g., self.scroll)
    if (t.isMemberExpression(node)) {
        const memberName = getMemberExpressionName(node);
        return `<MemberExpression: ${memberName}>`;
    }

    // NEW: Handle bind expressions (e.g., self.scroll.bind(self, "down"))
    if (t.isCallExpression(node) && t.isMemberExpression(node.callee)) {
        const member = node.callee;
        if (t.isIdentifier(member.property) && member.property.name === 'bind') {
            const target = getMemberExpressionName(member.object);
            const args = node.arguments.slice(1).map(arg => {
                const val = extractValue(arg);
                return val !== undefined && typeof val !== 'object' ? JSON.stringify(val) : '<expr>';
            }).join(', ');
            return `<BoundFunction: ${target}(${args})>`;
        }
    }

    return undefined;
}

// ============================================================================
// SETTINGS DETECTION HELPER FUNCTIONS
// ============================================================================

/**
 * Get the name of the function containing the current node
 */
function getContainingFunctionName(path: any): string {
    let current = path;

    while (current) {
        const node = current.node;

        // Check for function declaration: function foo() {}
        if (t.isFunctionDeclaration(node) && node.id) {
            return node.id.name;
        }

        // Check for method definition: obj.foo = function() {}
        if (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
            const parent = current.parent;

            // Assignment: foo = function() {}
            if (t.isAssignmentExpression(parent) && t.isIdentifier(parent.left)) {
                return parent.left.name;
            }

            // Object method: { foo: function() {} }
            if (t.isObjectProperty(parent) && t.isIdentifier(parent.key)) {
                return parent.key.name;
            }

            // Variable: const foo = function() {}
            if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
                return parent.id.name;
            }

            // Assignment to member: obj.foo = function() {}
            if (t.isAssignmentExpression(parent) && t.isMemberExpression(parent.left)) {
                const prop = parent.left.property;
                if (t.isIdentifier(prop)) {
                    return prop.name;
                }
            }
        }

        current = current.parentPath;
    }

    return '<anonymous>';
}

/**
 * Determine if this is a read or write access
 */
function getAccessContext(path: any): 'read' | 'write' {
    const parent = path.parent;

    // Check if this is on the left side of an assignment
    if (t.isAssignmentExpression(parent) && parent.left === path.node) {
        return 'write';
    }

    // Default to read
    return 'read';
}

/**
 * Detect settings usage in a file
 */
function detectSettingsInFile(filePath: string, relPath: string, usages: SettingUsage[]): void {
    const code = fs.readFileSync(filePath, 'utf-8');

    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript']
        });
    } catch (e) {
        // Silently skip files that can't be parsed
        return;
    }

    traverse(ast, {
        MemberExpression(path: any) {
            const node = path.node;

            // Check for runtime.conf.*
            if (t.isMemberExpression(node.object) &&
                t.isIdentifier(node.object.object, { name: 'runtime' }) &&
                t.isIdentifier(node.object.property, { name: 'conf' }) &&
                t.isIdentifier(node.property)) {

                usages.push({
                    setting: node.property.name,
                    type: 'runtime.conf',
                    file: relPath,
                    line: node.loc?.start.line || 0,
                    functionName: getContainingFunctionName(path),
                    context: getAccessContext(path)
                });
            }

            // Check for settings.*
            if (t.isIdentifier(node.object, { name: 'settings' }) &&
                t.isIdentifier(node.property)) {

                usages.push({
                    setting: node.property.name,
                    type: 'settings',
                    file: relPath,
                    line: node.loc?.start.line || 0,
                    functionName: getContainingFunctionName(path),
                    context: getAccessContext(path)
                });
            }
        }
    });
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
            const mappingOptions: Record<string, any> = {};

            for (const prop of objArg.properties) {
                if (!t.isObjectProperty(prop) || prop.computed) continue;

                let propKey: string | undefined;
                if (t.isIdentifier(prop.key)) {
                    propKey = prop.key.name;
                } else if (t.isStringLiteral(prop.key)) {
                    propKey = prop.key.value;
                }

                if (!propKey) continue;

                if (propKey === 'annotation') {
                    annotation = extractValue(prop.value);
                } else {
                    // All other properties are mapping options
                    const value = extractValue(prop.value);
                    if (value !== undefined) {
                        mappingOptions[propKey] = value;
                    }
                }
            }

            if (annotation === undefined) return; // Allow empty strings

            // Determine mode from file path
            let mode = 'Normal';
            if (relPath.includes('insert.js')) mode = 'Insert';
            else if (relPath.includes('visual.js')) mode = 'Visual';
            else if (relPath.includes('omnibar.js')) mode = 'Omnibar';
            else if (relPath.includes('hints.js')) mode = 'Hints';
            else if (relPath.includes('cursorPrompt.js')) mode = 'CursorPrompt';

            const lineNum = path.node.loc?.start.line || 0;

            // Derive runtime options from mapping options
            const runtimeOptions = {
                accepts_count: mappingOptions.repeatIgnore !== true
            };

            mappings.push({
                key,
                mode,
                annotation,
                source: { file: relPath, line: lineNum },
                mappingType: 'direct',
                ...(Object.keys(mappingOptions).length > 0 ? { mapping_options: mappingOptions } : {}),
                runtime_options: runtimeOptions
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

function scanDirectoryForSettings(dir: string, basePath: string, usages: SettingUsage[]): void {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filepath = path.join(dir, file);
        const stat = fs.statSync(filepath);

        if (stat.isDirectory()) {
            // Skip node_modules and hidden directories
            if (file === 'node_modules' || file.startsWith('.')) {
                continue;
            }
            scanDirectoryForSettings(filepath, basePath, usages);
        } else if (file.endsWith('.js') || file.endsWith('.ts')) {
            const relPath = path.relative(basePath, filepath);
            detectSettingsInFile(filepath, relPath, usages);
        }
    }
}

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

/**
 * Generate settings statistics from usages
 */
function generateSettingsStatistics(usages: SettingUsage[]): any {
    const excludedNames = new Set(EXCLUDED_SETTINGS.map(e => e.name));

    // Filter out excluded settings
    const filteredUsages = usages.filter(usage => !excludedNames.has(usage.setting));

    const statsMap = new Map<string, SettingStats>();

    for (const usage of filteredUsages) {
        const key = `${usage.type}.${usage.setting}`;

        if (!statsMap.has(key)) {
            statsMap.set(key, {
                setting: usage.setting,
                type: usage.type,
                count: 0,
                files: new Set(),
                functions: new Set(),
                usages: []
            });
        }

        const stat = statsMap.get(key)!;
        stat.count++;
        stat.files.add(usage.file);
        stat.functions.add(usage.functionName);
        stat.usages.push(usage);
    }

    // Convert to array and sort by frequency
    const settingsList = Array.from(statsMap.values()).sort((a, b) => b.count - a.count);

    return {
        summary: {
            total_usages: filteredUsages.length,
            unique_settings: settingsList.length,
            runtime_conf_settings: settingsList.filter(s => s.type === 'runtime.conf').length,
            settings_api: settingsList.filter(s => s.type === 'settings').length,
            excluded_count: EXCLUDED_SETTINGS.length
        },
        excluded: EXCLUDED_SETTINGS,
        list: settingsList.map(stat => ({
            setting: stat.setting,
            type: stat.type,
            frequency: stat.count,
            files: Array.from(stat.files).sort(),
            functions: Array.from(stat.functions).sort(),
            usages: stat.usages.map(u => ({
                file: u.file,
                line: u.line,
                function: u.functionName,
                context: u.context
            }))
        }))
    };
}

/**
 * Generate configuration options report by discovering all properties
 * from mapping_options across all mappings
 */
function generateConfigOptionsReport(mappings: MappingEntry[]): Record<string, any> {
    const configStats: Record<string, { count: number; values: Set<any> }> = {};

    for (const mapping of mappings) {
        if (!mapping.mapping_options) continue;

        for (const [key, value] of Object.entries(mapping.mapping_options)) {
            if (value === undefined) continue;

            if (!configStats[key]) {
                configStats[key] = { count: 0, values: new Set() };
            }

            configStats[key].count++;

            // Store sample values (limit to 5)
            if (configStats[key].values.size < 5) {
                if (typeof value === 'object') {
                    configStats[key].values.add(JSON.stringify(value));
                } else {
                    configStats[key].values.add(value);
                }
            }
        }
    }

    // Convert to final format
    const result: Record<string, any> = {};
    const total = mappings.length;

    for (const [key, stats] of Object.entries(configStats)) {
        result[key] = {
            count: stats.count,
            percentage: ((stats.count / total) * 100).toFixed(1) + '%',
            sample_values: Array.from(stats.values)
        };
    }

    return result;
}

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
        },
        config_options: generateConfigOptionsReport(mappings)  // NEW: Add config options discovery
    };

    // Track unique_ids to detect duplicates
    const uniqueIdMap = new Map<string, MappingEntry[]>();

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

        // Track unique_ids for duplicate detection
        if (typeof mapping.annotation === 'object' && mapping.annotation.unique_id) {
            const uid = mapping.annotation.unique_id;
            if (!uniqueIdMap.has(uid)) {
                uniqueIdMap.set(uid, []);
            }
            uniqueIdMap.get(uid)!.push(mapping);
        }

        summary.validation[validation.status]++;
    }

    // Second pass: mark duplicates as invalid
    for (const [uid, mappingsWithId] of uniqueIdMap.entries()) {
        if (mappingsWithId.length > 1) {
            // Check if these are browser-specific variants (same key, same file, different implementations)
            const isBrowserVariant =
                mappingsWithId.every(m => m.key === mappingsWithId[0].key) && // Same key
                mappingsWithId.every(m => m.source.file === mappingsWithId[0].source.file) && // Same file
                mappingsWithId.length === 2; // Exactly 2 variants

            if (isBrowserVariant) {
                // Skip marking as invalid - these are intentional browser-specific implementations
                continue;
            }

            // Mark all but the first as invalid duplicates
            for (let i = 1; i < mappingsWithId.length; i++) {
                const mapping = mappingsWithId[i];
                // Decrement the old validation count
                if (mapping.validationStatus) {
                    summary.validation[mapping.validationStatus]--;
                }
                // Update to invalid
                mapping.validationStatus = 'invalid';
                if (!mapping.validationErrors) {
                    mapping.validationErrors = [];
                }
                mapping.validationErrors.push(
                    `Duplicate unique_id: "${uid}" (also used in ${mappingsWithId[0].source.file}:${mappingsWithId[0].source.line})`
                );
                // Increment invalid count
                summary.validation.invalid++;
            }
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

    // Scan for settings usage
    const settingsUsages: SettingUsage[] = [];
    scanDirectoryForSettings(srcDir, srcDir, settingsUsages);
    const settingsStats = generateSettingsStatistics(settingsUsages);

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
        summary,
        settings: settingsStats
    };

    // Output JSON
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main();
