'use strict';

const fs = require('fs');
const path = require('path');

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow package-lock.json in the repo — use bun and update bun.lock instead',
        },
        schema: [],
        messages: {
            found: 'package-lock.json must not exist in the repo. Remove it and use `bun install` to update bun.lock instead.',
        },
    },
    create(context) {
        return {
            'Program:exit'(node) {
                const cwd = context.getCwd ? context.getCwd() : process.cwd();
                if (fs.existsSync(path.join(cwd, 'package-lock.json'))) {
                    context.report({ node, messageId: 'found' });
                }
            },
        };
    },
};
