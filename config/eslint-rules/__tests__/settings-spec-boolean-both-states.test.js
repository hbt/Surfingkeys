'use strict';

const { RuleTester } = require('eslint');
const rule = require('../settings-spec-boolean-both-states');

const tester = new RuleTester({
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

// Use the actual project CWD so the rule can find docs/settings/all.json
const CWD = require('path').resolve(__dirname, '../../..');

tester.run('settings-spec-boolean-both-states', rule, {
    valid: [
        // Non-boolean setting — no complaint
        {
            code: `
                test('larger scroll', async () => {
                    await applySetting(page, 'scrollStepSize', 200);
                    await restoreSetting(page, 'scrollStepSize');
                });
            `,
            filename: 'tests/playwright/settings/setting-scroll-step-size.spec.ts',
        },
        // Boolean setting tested with both states
        {
            code: `
                test('digitForRepeat=false', async () => {
                    await applySetting(page, 'digitForRepeat', false);
                    await restoreSetting(page, 'digitForRepeat');
                });
                test('digitForRepeat=true', async () => {
                    await applySetting(page, 'digitForRepeat', true);
                    await restoreSetting(page, 'digitForRepeat');
                });
            `,
            filename: 'tests/playwright/settings/setting-digit-for-repeat.spec.ts',
        },
        // No applySetting calls for boolean settings — OK
        {
            code: `
                test('default behavior', async () => {
                    const result = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down' });
                    expect(result.delta).toBeGreaterThan(10);
                });
            `,
            filename: 'tests/playwright/settings/setting-scroll-step-size.spec.ts',
        },
    ],
    invalid: [
        // Boolean setting only tested with false
        {
            code: `
                test('digitForRepeat=false disables prefix', async () => {
                    await applySetting(page, 'digitForRepeat', false);
                    await restoreSetting(page, 'digitForRepeat');
                });
            `,
            filename: 'tests/playwright/settings/setting-digit-for-repeat.spec.ts',
            errors: [{ messageId: 'missingState' }],
        },
        // Boolean setting only tested with true
        {
            code: `
                test('smoothScroll=true', async () => {
                    await applySetting(page, 'smoothScroll', true);
                    await restoreSetting(page, 'smoothScroll');
                });
            `,
            filename: 'tests/playwright/settings/setting-smooth-scroll.spec.ts',
            errors: [{ messageId: 'missingState' }],
        },
    ],
});

console.log('settings-spec-boolean-both-states: all tests passed');
