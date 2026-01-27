#!/usr/bin/env bun
/**
 * Experimental: Detect all settings usage in the codebase using AST
 *
 * This script finds all references to:
 * - runtime.conf.*
 * - settings.*
 *
 * For each usage, it reports:
 * - Setting name
 * - File path
 * - Line number
 * - Containing function name
 *
 * Output: Statistics about settings usage frequency and locations
 */

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// AST HELPER FUNCTIONS
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

// ============================================================================
// SETTINGS DETECTION
// ============================================================================

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

// ============================================================================
// FILE SCANNER
// ============================================================================

function scanDirectory(dir: string, basePath: string, usages: SettingUsage[]): void {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filepath = path.join(dir, file);
        const stat = fs.statSync(filepath);

        if (stat.isDirectory()) {
            // Skip node_modules and hidden directories
            if (file === 'node_modules' || file.startsWith('.')) {
                continue;
            }
            scanDirectory(filepath, basePath, usages);
        } else if (file.endsWith('.js') || file.endsWith('.ts')) {
            const relPath = path.relative(basePath, filepath);
            detectSettingsInFile(filepath, relPath, usages);
        }
    }
}

// ============================================================================
// STATISTICS GENERATION
// ============================================================================

function generateStatistics(usages: SettingUsage[]): Map<string, SettingStats> {
    const stats = new Map<string, SettingStats>();

    for (const usage of usages) {
        const key = `${usage.type}.${usage.setting}`;

        if (!stats.has(key)) {
            stats.set(key, {
                setting: usage.setting,
                type: usage.type,
                count: 0,
                files: new Set(),
                functions: new Set(),
                usages: []
            });
        }

        const stat = stats.get(key)!;
        stat.count++;
        stat.files.add(usage.file);
        stat.functions.add(usage.functionName);
        stat.usages.push(usage);
    }

    return stats;
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
    const srcDir = path.join(__dirname, '..', 'src');
    const usages: SettingUsage[] = [];

    // Scan all source files
    scanDirectory(srcDir, srcDir, usages);

    // Generate statistics
    const stats = generateStatistics(usages);

    // Sort by frequency (descending)
    const sortedStats = Array.from(stats.values()).sort((a, b) => b.count - a.count);

    // Create report
    const report = {
        summary: {
            total_usages: usages.length,
            unique_settings: sortedStats.length,
            runtime_conf_settings: sortedStats.filter(s => s.type === 'runtime.conf').length,
            settings_api: sortedStats.filter(s => s.type === 'settings').length
        },
        settings: sortedStats.map(stat => ({
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

    // Output JSON
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main();
