'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Every test() block with applySetting() must also call restoreSetting()',
        },
        schema: [],
        messages: {
            missingRestore: 'test() block calls applySetting() but is missing restoreSetting() — settings must be restored to avoid test pollution',
        },
    },
    create(context) {
        return {
            CallExpression(node) {
                // Match test('title', async () => { ... }) or test('title', () => { ... })
                if (
                    node.callee.type !== 'Identifier' ||
                    node.callee.name !== 'test'
                ) return;

                // Must have at least 2 args, last arg must be a function
                if (node.arguments.length < 2) return;
                const lastArg = node.arguments[node.arguments.length - 1];
                if (
                    lastArg.type !== 'ArrowFunctionExpression' &&
                    lastArg.type !== 'FunctionExpression'
                ) return;

                // Get the source text of the function body
                const src = context.getSourceCode().getText(lastArg);
                const hasApply = src.includes('applySetting(');
                const hasRestore = src.includes('restoreSetting(');

                if (hasApply && !hasRestore) {
                    context.report({ node, messageId: 'missingRestore' });
                }
            },
        };
    },
};
