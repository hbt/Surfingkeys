import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { MappingEntry, AnnotationObject } from './types';
import { MODE_MAP } from './constants';
import {
    extractHandlerType,
    extractValue,
    matchesMemberExpression
} from './ast-helpers';

// ============================================================================
// AST PATTERN EXTRACTORS
// ============================================================================

/**
 * Parse mapkey/vmapkey/imapkey/cmapkey patterns using AST
 */
export function parseMapkeyPatternsAST(
    code: string,
    relPath: string,
    mappings: MappingEntry[]
): void {
    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript']
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

            let handlerType: string = 'uncaptured';
            let handlerName: string | undefined;
            if (args.length >= 3 && args[2]) {
                const h = extractHandlerType(args[2]);
                handlerType = h.type;
                handlerName = h.name;
            }

            mappings.push({
                key,
                mode,
                annotation,
                source: { file: relPath, line: lineNum },
                mappingType: 'mapkey',
                handler_type: handlerType as MappingEntry['handler_type'],
                ...(handlerName !== undefined && { handler_name: handlerName })
            });
        }
    });
}

/**
 * Parse mode.mappings.add() patterns (direct Trie additions) using AST
 */
export function parseMappingsAddPatternsAST(
    code: string,
    relPath: string,
    mappings: MappingEntry[]
): void {
    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript']
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
            let handlerInfo: { type: 'inline' | 'named' | 'bound' | 'method' | 'unknown'; name?: string } | undefined;

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
                } else if (propKey === 'code') {
                    // Preserve existing serialization
                    const value = extractValue(prop.value);
                    if (value !== undefined) {
                        mappingOptions[propKey] = value;
                    }
                    handlerInfo = extractHandlerType(prop.value);
                } else {
                    // All other properties are mapping options
                    const value = extractValue(prop.value);
                    if (value !== undefined) {
                        mappingOptions[propKey] = value;
                    }
                }
            }

            if (annotation === undefined) return; // Allow empty strings

            // Determine mode from file path (match both .js and .ts extensions)
            const relPathBase = relPath.replace(/\.(js|ts)$/, '');
            let mode = 'Normal';
            if (relPathBase.endsWith('insert')) mode = 'Insert';
            else if (relPathBase.endsWith('visual')) mode = 'Visual';
            else if (relPathBase.endsWith('omnibar')) mode = 'Omnibar';
            else if (relPathBase.endsWith('hints')) mode = 'Hints';
            else if (relPathBase.endsWith('cursorPrompt')) mode = 'CursorPrompt';

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
                ...(handlerInfo !== undefined && { handler_type: handlerInfo.type }),
                ...(handlerInfo?.name !== undefined && { handler_name: handlerInfo.name }),
                ...(Object.keys(mappingOptions).length > 0 ? { mapping_options: mappingOptions } : {}),
                runtime_options: runtimeOptions
            });
        }
    });
}

/**
 * Parse command() patterns using AST
 */
export function parseCommandPatternsAST(
    code: string,
    relPath: string,
    mappings: MappingEntry[]
): void {
    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript']
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

            let handlerType: string = 'uncaptured';
            let handlerName: string | undefined;
            if (args.length >= 3 && args[2]) {
                const h = extractHandlerType(args[2]);
                handlerType = h.type;
                handlerName = h.name;
            }

            mappings.push({
                key: name,
                mode: 'Command',
                annotation,
                source: { file: relPath, line: lineNum },
                mappingType: 'command',
                handler_type: handlerType as MappingEntry['handler_type'],
                ...(handlerName !== undefined && { handler_name: handlerName })
            });
        }
    });
}

/**
 * Parse addSearchAlias() patterns using AST and expand into individual mappings
 */
export function parseSearchAliasPatternsAST(
    code: string,
    relPath: string,
    mappings: MappingEntry[]
): void {
    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript']
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
                mappingType: 'search_alias',
                handler_type: 'synthetic'
            });

            // 2. o<alias> - Open omnibar for search
            mappings.push({
                key: `o${alias}`,
                mode: 'Normal',
                annotation: `${annotation} (omnibar)`,
                source: { file: relPath, line: lineNum },
                mappingType: 'search_alias',
                handler_type: 'synthetic'
            });

            // 3. <searchLeaderKey>o<alias> - Search only this site
            if (searchLeaderKey !== 's') {
                mappings.push({
                    key: `${searchLeaderKey}o${alias}`,
                    mode: 'Normal',
                    annotation: `${annotation} (this site only)`,
                    source: { file: relPath, line: lineNum },
                    mappingType: 'search_alias',
                    handler_type: 'synthetic'
                });
            }

            // 4. Uppercase variant if different from lowercase
            if (alias !== alias.toUpperCase()) {
                mappings.push({
                    key: `${searchLeaderKey}${alias.toUpperCase()}`,
                    mode: 'Visual',
                    annotation: `${annotation} (selected, uppercase variant)`,
                    source: { file: relPath, line: lineNum },
                    mappingType: 'search_alias',
                    handler_type: 'synthetic'
                });
            }
        }
    });
}
