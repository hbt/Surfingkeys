'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Require commands to have their own custom mapping defined via Playwright test (callSKApi unmapAllExcept + mapcmdkey)',
        },
        schema: [],
        messages: {
            missingUnmapAll: 'Missing callSKApi(…, "unmapAllExcept", []) — key tests must clear all mappings before testing',
            missingMapcmdkey: 'Missing callSKApi(…, "mapcmdkey", key, unique_id) — key tests must bind the command under test',
        },
    },
    create(context) {
        let hasUnmapAll = false;
        let hasMapcmdkey = false;
        let usesInvokeCommand = false;

        return {
            CallExpression(node) {
                // invokeCommand-based tests bypass key dispatch — no mapping setup needed
                if (node.callee.type === 'Identifier' && node.callee.name === 'invokeCommand') {
                    usesInvokeCommand = true;
                    return;
                }
                if (node.callee.type !== 'Identifier' || node.callee.name !== 'callSKApi') return;
                const secondArg = node.arguments[1];
                if (!secondArg || secondArg.type !== 'Literal') return;
                if (secondArg.value === 'unmapAllExcept') {
                    hasUnmapAll = true;
                    // unmapAllExcept([KEY]) with a non-empty array preserves the SA key binding
                    // and counts as the explicit key declaration (SA commands can't use mapcmdkey)
                    const thirdArg = node.arguments[2];
                    if (thirdArg && thirdArg.type === 'ArrayExpression' && thirdArg.elements.length > 0) {
                        hasMapcmdkey = true;
                    }
                }
                if (secondArg.value === 'mapcmdkey') hasMapcmdkey = true;
            },
            'Program:exit'(node) {
                if (usesInvokeCommand) return;
                if (!hasUnmapAll)  context.report({ node, messageId: 'missingUnmapAll' });
                if (!hasMapcmdkey) context.report({ node, messageId: 'missingMapcmdkey' });
            },
        };
    },
};
