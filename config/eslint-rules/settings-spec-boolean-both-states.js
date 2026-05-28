'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Load the set of boolean setting names from docs/settings/all.json.
 * Returns a Set of unique_ids. Falls back to empty set if file not found.
 */
function loadBooleanSettings(cwd) {
    try {
        const annotationsPath = path.join(cwd, 'docs', 'settings', 'all.json');
        const content = fs.readFileSync(annotationsPath, 'utf-8');
        const data = JSON.parse(content);
        const boolSet = new Set();
        if (data.settings && Array.isArray(data.settings)) {
            for (const s of data.settings) {
                if (s.valueType === 'boolean' && s.unique_id) {
                    // unique_ids like "setting_digitForRepeat" → "digitForRepeat"
                    // or "smoothScroll" → "smoothScroll"
                    const name = s.unique_id.replace(/^setting_/, '');
                    boolSet.add(name);
                    // Also add the original unique_id in case the spec uses it
                    boolSet.add(s.unique_id);
                }
            }
        }
        return boolSet;
    } catch (_e) {
        return new Set();
    }
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Boolean settings should be tested with both true and false values',
        },
        schema: [],
        messages: {
            missingState: 'Boolean setting "{{key}}" is tested with {{found}} but not {{missing}} — add a test for both states',
        },
    },
    create(context) {
        const cwd = context.getCwd ? context.getCwd() : process.cwd();
        const booleanSettings = loadBooleanSettings(cwd);

        // Track which boolean values have been seen per setting key
        // key → Set of boolean values seen ('true' | 'false')
        const settingStates = new Map();

        return {
            CallExpression(node) {
                // Match applySetting(page, 'key', true/false)
                if (
                    node.callee.type !== 'Identifier' ||
                    node.callee.name !== 'applySetting'
                ) return;

                if (node.arguments.length < 3) return;

                const keyArg = node.arguments[1];
                const valueArg = node.arguments[2];

                if (keyArg.type !== 'Literal' || typeof keyArg.value !== 'string') return;
                if (valueArg.type !== 'Literal' || typeof valueArg.value !== 'boolean') return;

                const key = keyArg.value;
                const value = valueArg.value;

                if (!booleanSettings.has(key)) return;

                if (!settingStates.has(key)) {
                    settingStates.set(key, new Set());
                }
                settingStates.get(key).add(value);
            },

            'Program:exit'(node) {
                for (const [key, states] of settingStates) {
                    const hasTrue = states.has(true);
                    const hasFalse = states.has(false);
                    if (hasTrue && !hasFalse) {
                        context.report({
                            node,
                            messageId: 'missingState',
                            data: { key, found: 'true', missing: 'false' },
                        });
                    } else if (hasFalse && !hasTrue) {
                        context.report({
                            node,
                            messageId: 'missingState',
                            data: { key, found: 'false', missing: 'true' },
                        });
                    }
                }
            },
        };
    },
};
