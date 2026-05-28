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
            missingFlush: [
                'Settings spec must flush coverage.',
                'If using launchWithCoverage(), add `await cov?.close()` in afterAll.',
                'If using launchWithDualCoverage(), use `withPersistedDualCoverage` instead.',
            ].join(' '),
        },
    },
    create(context) {
        let found = false;

        function checkCall(node) {
            if (node.type !== 'CallExpression') return;

            const callee = node.callee;

            // Check for cov*.close() — MemberExpression where property is 'close'
            // and object name starts with 'cov' (handles cov, covBg, coverage, etc.)
            if (
                callee.type === 'MemberExpression' &&
                callee.property.type === 'Identifier' &&
                callee.property.name === 'close' &&
                callee.object.type === 'Identifier' &&
                /^cov/i.test(callee.object.name)
            ) {
                found = true;
                return;
            }

            // Check for withPersistedDualCoverage(...) — direct call or method call
            const calleeName =
                (callee.type === 'Identifier' && callee.name) ||
                (callee.type === 'MemberExpression' &&
                    callee.property.type === 'Identifier' &&
                    callee.property.name);
            if (calleeName === 'withPersistedDualCoverage') {
                found = true;
            }
        }

        return {
            CallExpression(node) {
                checkCall(node);
            },
            'Program:exit'(node) {
                if (!found) {
                    context.report({ node, messageId: 'missingFlush' });
                }
            },
        };
    },
};
