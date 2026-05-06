import * as fs from 'fs';
import * as path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { SettingUsage, SettingStats, SettingsAnnotation } from './types';
import { EXCLUDED_SETTINGS } from './constants';

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
export function detectSettingsInFile(filePath: string, relPath: string, usages: SettingUsage[]): void {
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

export function scanDirectoryForSettings(dir: string, basePath: string, usages: SettingUsage[]): void {
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

/**
 * Load all settings annotations from docs/settings/all.json
 */
export function loadSettingsAnnotations(projectRoot: string): Map<string, SettingsAnnotation> {
    const annotationsPath = path.join(projectRoot, 'docs', 'settings', 'all.json');

    try {
        const content = fs.readFileSync(annotationsPath, 'utf-8');
        const data = JSON.parse(content);

        const annotationsMap = new Map<string, SettingsAnnotation>();

        if (data.settings && Array.isArray(data.settings)) {
            for (const setting of data.settings) {
                // Map by both unique_id and setting name
                if (setting.unique_id) {
                    annotationsMap.set(setting.unique_id, setting);
                }
            }
        }

        return annotationsMap;
    } catch (e) {
        // If annotations file doesn't exist, return empty map
        return new Map();
    }
}

/**
 * Generate settings statistics from usages
 */
export function generateSettingsStatistics(usages: SettingUsage[], annotationsMap: Map<string, SettingsAnnotation>): any {
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
        list: settingsList.map(stat => {
            // Try to find annotation for this setting
            const annotation = annotationsMap.get(`setting_${stat.setting}`) ||
                              annotationsMap.get(stat.setting);

            return {
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
                })),
                ...(annotation && { annotation })
            };
        })
    };
}
