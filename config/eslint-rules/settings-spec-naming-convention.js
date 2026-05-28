'use strict';

const path = require('path');

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Settings spec files must be named setting-<name>.spec.ts',
        },
        schema: [],
        messages: {
            badName: 'Settings spec file "{{filename}}" must match /^setting-[a-z][a-z0-9-]*\\.spec\\.ts$/ (e.g. setting-scroll-step-size.spec.ts)',
        },
    },
    create(context) {
        return {
            'Program:exit'(node) {
                const filename = path.basename(context.getFilename());
                if (!/^setting-[a-z][a-z0-9-]*\.spec\.ts$/.test(filename)) {
                    context.report({ node, messageId: 'badName', data: { filename } });
                }
            },
        };
    },
};
