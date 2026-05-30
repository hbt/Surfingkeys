import * as fs from 'fs';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { MappingEntry, CustomConfigMapping, CustomConfiguration } from './types';
import { extractValue } from './ast-helpers';

// ============================================================================
// CUSTOM CONFIGURATION PARSER
// ============================================================================

/**
 * Parse custom configuration file using AST
 * Extracts mapkey/vmapkey/imapkey/cmapkey/map/unmap calls
 * Returns custom mappings with optional unique_id and description
 */
export function parseCustomConfigAST(configPath: string): CustomConfiguration {
    const mappings: CustomConfigMapping[] = [];

    if (!fs.existsSync(configPath)) {
        return {
            summary: { total: 0 },
            mappings: []
        };
    }

    const code = fs.readFileSync(configPath, 'utf-8');

    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['jsx']
        });
    } catch (e) {
        // Return empty config if file can't be parsed
        return {
            summary: { total: 0 },
            mappings: []
        };
    }

    traverse(ast, {
        CallExpression(path: any) {
            const callee = path.node.callee;

            // Determine function name
            let functionName: string | undefined;

            if (t.isIdentifier(callee)) {
                // Direct call: mapkey(...), unmap(...), etc.
                functionName = callee.name;
            } else if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
                // Member call: api.mapkey(...) or self.mapkey(...)
                functionName = callee.property.name;
            }

            // Check if it's a mapping function we care about
            const supportedFunctions = ['mapkey', 'vmapkey', 'imapkey', 'cmapkey', 'mapcmdkey', 'vmapcmdkey', 'imapcmdkey', 'cmapcmdkey', 'map', 'unmap'];
            if (!functionName || !supportedFunctions.includes(functionName)) {
                return;
            }

            const args = path.node.arguments;

            // All functions need at least a key argument
            if (args.length < 1) return;

            // Extract key (first argument)
            const key = extractValue(args[0]);
            if (typeof key !== 'string') return;

            let unique_id: string | undefined;
            let description: string | undefined;

            // For mapcmdkey/vmapcmdkey/imapcmdkey/cmapcmdkey: second arg is the unique_id directly
            if (['mapcmdkey', 'vmapcmdkey', 'imapcmdkey', 'cmapcmdkey'].includes(functionName)) {
                if (args.length >= 2) {
                    const secondArg = extractValue(args[1]);
                    if (typeof secondArg === 'string') {
                        unique_id = secondArg;
                    }
                }
            }
            // For mapkey/vmapkey/imapkey/cmapkey: annotation is 2nd argument
            // For map/unmap: description might be in a different position or options object
            else if (['mapkey', 'vmapkey', 'imapkey', 'cmapkey'].includes(functionName)) {
                if (args.length >= 2) {
                    const annotation = extractValue(args[1]);

                    // If annotation is an object, extract unique_id and short/description
                    if (typeof annotation === 'object' && annotation !== null) {
                        unique_id = annotation.unique_id;
                        description = annotation.short || annotation.description;
                    } else if (typeof annotation === 'string') {
                        // For legacy string annotations, use as description
                        description = annotation;
                    }
                }
            }

            // Detect domain option: mapkey/vmapkey/imapkey/cmapkey use args[3], mapcmdkey uses args[2]
            const optionsArgIndex = ['mapcmdkey', 'vmapcmdkey', 'imapcmdkey', 'cmapcmdkey'].includes(functionName) ? 2 : 3;
            const optionsArg = args[optionsArgIndex];
            const hasDomain = !!(optionsArg && t.isObjectExpression(optionsArg) &&
                optionsArg.properties.some((p: any) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'domain'));

            mappings.push({
                key,
                type: functionName as any,
                ...(unique_id && { unique_id }),
                ...(description && { description }),
                ...(hasDomain && { hasDomain }),
                ...(path.node.loc?.start.line !== undefined && { line: path.node.loc.start.line }),
            });
        }
    });

    return {
        summary: { total: mappings.length },
        mappings
    };
}

/**
 * Cross-reference built-in mappings against custom config mappings by unique_id.
 * Mutates mappings in place (same pattern as generateTestCoverageStats).
 * Returns summary counts.
 */
export function generateCustomMappingStats(mappings: MappingEntry[], customConfig: CustomConfiguration): {
    mapped: number;
    unmapped: number;
} {
    // Build map: unique_id -> list of custom config entries that reference it
    const uidToCustomMappings = new Map<string, Array<{ key: string; type: string }>>();

    for (const cm of customConfig.mappings) {
        if (cm.unique_id) {
            if (!uidToCustomMappings.has(cm.unique_id)) {
                uidToCustomMappings.set(cm.unique_id, []);
            }
            uidToCustomMappings.get(cm.unique_id)!.push({ key: cm.key, type: cm.type });
        }
    }

    let mapped = 0;
    let unmapped = 0;

    // Track unique_ids already counted to avoid double-counting duplicate entries
    const countedUids = new Set<string>();

    for (const mapping of mappings) {
        if (typeof mapping.annotation !== 'object' || !mapping.annotation.unique_id) {
            continue;
        }

        const uid = mapping.annotation.unique_id;
        const customMappings = uidToCustomMappings.get(uid);

        if (customMappings && customMappings.length > 0) {
            mapping.custom_mapping = { hasMapping: true, mappings: customMappings };
            if (!countedUids.has(uid)) {
                mapped++;
                countedUids.add(uid);
            }
        } else {
            mapping.custom_mapping = { hasMapping: false };
            if (!countedUids.has(uid)) {
                unmapped++;
                countedUids.add(uid);
            }
        }
    }

    return { mapped, unmapped };
}
