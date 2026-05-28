'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Settings spec files must flush coverage via cov?.close() or withPersistedDualCoverage',
        },
        schema: [],
        messages: {
            missingFlush: 'Settings spec must flush coverage — add `await cov?.close()` in afterAll, or use `withPersistedDualCoverage`',
        },
    },
    create(context) {
        return {
            'Program:exit'(node) {
                const src = context.getSourceCode().getText();
                if (!/cov\w*\?\.close\(\)|withPersistedDualCoverage/.test(src)) {
                    context.report({ node, messageId: 'missingFlush' });
                }
            },
        };
    },
};
