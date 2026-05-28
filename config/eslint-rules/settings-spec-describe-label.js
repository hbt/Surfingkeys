'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Settings spec test.describe() label must be "setting: <camelCaseName>"',
        },
        schema: [],
        messages: {
            missingDescribe: 'Settings spec must have a test.describe() call',
            badLabel: 'test.describe() label "{{label}}" must match /^setting: [a-z][a-zA-Z0-9]+$/ (e.g. "setting: scrollStepSize")',
        },
    },
    create(context) {
        let hasDescribe = false;

        return {
            CallExpression(node) {
                // Match test.describe(...)
                if (
                    node.callee.type !== 'MemberExpression' ||
                    node.callee.object.type !== 'Identifier' ||
                    node.callee.object.name !== 'test' ||
                    node.callee.property.type !== 'Identifier' ||
                    node.callee.property.name !== 'describe'
                ) return;

                hasDescribe = true;

                const firstArg = node.arguments[0];
                if (!firstArg || firstArg.type !== 'Literal' || typeof firstArg.value !== 'string') {
                    context.report({ node, messageId: 'badLabel', data: { label: '(non-string)' } });
                    return;
                }

                const label = firstArg.value;
                if (!/^setting: [a-z][a-zA-Z0-9]+$/.test(label)) {
                    context.report({ node: firstArg, messageId: 'badLabel', data: { label } });
                }
            },
            'Program:exit'(node) {
                if (!hasDescribe) {
                    context.report({ node, messageId: 'missingDescribe' });
                }
            },
        };
    },
};
