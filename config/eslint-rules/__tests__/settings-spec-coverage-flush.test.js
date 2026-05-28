'use strict';

const { RuleTester } = require('eslint');
const rule = require('../settings-spec-coverage-flush');

const tester = new RuleTester({
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('settings-spec-coverage-flush', rule, {
    valid: [
        {
            code: `
                test.afterAll(async () => {
                    await cov?.close();
                    await context?.close();
                });
            `,
            filename: 'tests/playwright/settings/setting-scroll-step-size.spec.ts',
        },
        {
            code: `
                test.afterAll(async () => {
                    await covBg?.close();
                    await context?.close();
                });
            `,
            filename: 'tests/playwright/settings/setting-something.spec.ts',
        },
        {
            code: `
                await withPersistedDualCoverage({ suiteLabel: 'x' }, 'test', async () => {});
            `,
            filename: 'tests/playwright/settings/setting-something.spec.ts',
        },
    ],
    invalid: [
        {
            code: `
                test.afterAll(async () => {
                    await context?.close();
                });
            `,
            filename: 'tests/playwright/settings/setting-foo.spec.ts',
            errors: [{ messageId: 'missingFlush' }],
        },
        {
            code: `// no coverage flush at all`,
            filename: 'tests/playwright/settings/setting-bar.spec.ts',
            errors: [{ messageId: 'missingFlush' }],
        },
    ],
});

console.log('settings-spec-coverage-flush: all tests passed');
