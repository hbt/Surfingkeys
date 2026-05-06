import * as t from '@babel/types';

// ============================================================================
// AST HELPER FUNCTIONS
// ============================================================================

/**
 * Helper function to get readable name from AST node
 */
export function getNodeName(node: any): string {
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
export function getCallExpressionName(callee: any): string {
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
export function getMemberExpressionName(node: any): string {
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
 * Determine the handler implementation type from an AST node (e.g. `code:` property or args[2]).
 * Returns a structured descriptor used to populate handler_type and handler_name on MappingEntry.
 */
export function extractHandlerType(node: any): { type: 'inline' | 'named' | 'bound' | 'method' | 'unknown'; name?: string } {
    if (!node) return { type: 'unknown' };
    const nodeType: string = node.type || '';

    // function() {} or () => {}
    if (nodeType === 'FunctionExpression' || nodeType === 'ArrowFunctionExpression') {
        return { type: 'inline' };
    }

    // moveCursorEOL
    if (nodeType === 'Identifier') {
        return { type: 'named', name: node.name };
    }

    // self.scroll.bind(self, "down") — check before plain MemberExpression
    if (nodeType === 'CallExpression') {
        const callee = node.callee;
        if (callee && callee.type === 'MemberExpression' && callee.property && callee.property.name === 'bind') {
            return { type: 'bound', name: getMemberExpressionName(callee.object) };
        }
    }

    // self.scroll (member expression, not a call)
    if (nodeType === 'MemberExpression') {
        return { type: 'method', name: getMemberExpressionName(node) };
    }

    return { type: 'unknown' };
}

/**
 * Extract the value from an AST node
 * Handles strings, numbers, booleans, objects, arrays, functions, call expressions, identifiers, and member expressions
 */
export function extractValue(node: any): any {
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

/**
 * Check if a node is a member expression matching a pattern
 * e.g., self.mappings.add or KeyboardUtils.encodeKeystroke
 */
export function matchesMemberExpression(node: any, pattern: string[]): boolean {
    if (!t.isMemberExpression(node)) return false;

    const parts: string[] = [];
    let current: any = node;

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
