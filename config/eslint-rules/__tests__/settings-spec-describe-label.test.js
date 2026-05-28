'use strict';

const { RuleTester } = require('eslint');
const rule = require('../settings-spec-describe-label');

const tester = new RuleTester({
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('settings-spec-describe-label', rule, {
    valid: [
        {
            code: `test.describe('setting: scrollStepSize', () => {});`,
            filename: 'tests/playwright/settings/setting-scroll-step-size.spec.ts',
        },
        {
            code: `test.describe('setting: digitForRepeat', () => {});`,
            filename: 'tests/playwright/settings/setting-digit-for-repeat.spec.ts',
        },
        {
            code: `test.describe('setting: newTabPosition', () => {});`,
            filename: 'tests/playwright/settings/setting-new-tab-position.spec.ts',
        },
        {
            code: `test.describe('setting: aB0', () => {});`,
            filename: 'tests/playwright/settings/setting-a-b0.spec.ts',
        },
    ],
    invalid: [
        // Missing describe
        {
            code: `// no describe`,
            filename: 'tests/playwright/settings/setting-foo.spec.ts',
            errors: [{ messageId: 'missingDescribe' }],
        },
        // Wrong prefix
        {
            code: `test.describe('ScrollStepSize', () => {});`,
            filename: 'tests/playwright/settings/setting-scroll-step-size.spec.ts',
            errors: [{ messageId: 'badLabel' }],
        },
        // No space after colon
        {
            code: `test.describe('setting:scrollStepSize', () => {});`,
            filename: 'tests/playwright/settings/setting-scroll-step-size.spec.ts',
            errors: [{ messageId: 'badLabel' }],
        },
        // Uppercase first char after prefix
        {
            code: `test.describe('setting: ScrollStepSize', () => {});`,
            filename: 'tests/playwright/settings/setting-scroll-step-size.spec.ts',
            errors: [{ messageId: 'badLabel' }],
        },
        // Kebab-case label (should be camelCase)
        {
            code: `test.describe('setting: scroll-step-size', () => {});`,
            filename: 'tests/playwright/settings/setting-scroll-step-size.spec.ts',
            errors: [{ messageId: 'badLabel' }],
        },
        // Trailing space
        {
            code: `test.describe('setting: scrollStepSize ', () => {});`,
            filename: 'tests/playwright/settings/setting-scroll-step-size.spec.ts',
            errors: [{ messageId: 'badLabel' }],
        },
    ],
});

console.log('settings-spec-describe-label: all tests passed');
