'use strict';

const { RuleTester } = require('eslint');
const rule = require('../settings-spec-restore-on-apply');

const tester = new RuleTester({
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('settings-spec-restore-on-apply', rule, {
    valid: [
        // No applySetting — no restore needed
        {
            code: `
                test('default behavior', async () => {
                    const result = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down' });
                    expect(result.delta).toBeGreaterThan(10);
                });
            `,
            filename: 'tests/playwright/settings/setting-scroll-step-size.spec.ts',
        },
        // Both applySetting and restoreSetting present
        {
            code: `
                test('larger scroll with 200', async () => {
                    await applySetting(page, 'scrollStepSize', 200);
                    const result = await sendKeyAndWaitForScroll(page, 'j', {});
                    expect(result.delta).toBeGreaterThan(100);
                    await restoreSetting(page, 'scrollStepSize');
                });
            `,
            filename: 'tests/playwright/settings/setting-scroll-step-size.spec.ts',
        },
        // restoreSetting used inside beforeEach/afterEach at test level — same block
        {
            code: `
                test('restores via afterEach', async () => {
                    await applySetting(page, 'scrollStepSize', 20);
                    await doStuff();
                    await restoreSetting(page, 'scrollStepSize');
                });
            `,
            filename: 'tests/playwright/settings/setting-scroll-step-size.spec.ts',
        },
    ],
    invalid: [
        // applySetting without restoreSetting
        {
            code: `
                test('missing restore', async () => {
                    await applySetting(page, 'scrollStepSize', 200);
                    const result = await sendKeyAndWaitForScroll(page, 'j', {});
                    expect(result.delta).toBeGreaterThan(100);
                });
            `,
            filename: 'tests/playwright/settings/setting-scroll-step-size.spec.ts',
            errors: [{ messageId: 'missingRestore' }],
        },
        // boolean setting apply without restore
        {
            code: `
                test('digitForRepeat=false', async () => {
                    await applySetting(page, 'digitForRepeat', false);
                    await page.keyboard.press('5');
                    await page.keyboard.press('j');
                    expect(true).toBe(true);
                });
            `,
            filename: 'tests/playwright/settings/setting-digit-for-repeat.spec.ts',
            errors: [{ messageId: 'missingRestore' }],
        },
        // restoreSetting only in a comment — AST-based rule must still FAIL
        {
            code: `
                test('restoreInComment', async () => {
                    await applySetting(page, 'scrollStepSize', 100);
                    // await restoreSetting(page, 'scrollStepSize');
                });
            `,
            filename: 'tests/playwright/settings/setting-scroll-step-size.spec.ts',
            errors: [{ messageId: 'missingRestore' }],
        },
    ],
});

console.log('settings-spec-restore-on-apply: all tests passed');
