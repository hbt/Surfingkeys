'use strict';

const { RuleTester } = require('eslint');
const rule = require('../settings-spec-naming-convention');

const tester = new RuleTester({
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('settings-spec-naming-convention', rule, {
    valid: [
        {
            code: '// ok',
            filename: 'tests/playwright/settings/setting-scroll-step-size.spec.ts',
        },
        {
            code: '// ok',
            filename: 'tests/playwright/settings/setting-digit-for-repeat.spec.ts',
        },
        {
            code: '// ok',
            filename: 'tests/playwright/settings/setting-new-tab-position.spec.ts',
        },
        {
            code: '// ok',
            filename: 'tests/playwright/settings/setting-a.spec.ts',
        },
    ],
    invalid: [
        {
            code: '// bad',
            filename: 'tests/playwright/settings/scrollStepSize.spec.ts',
            errors: [{ messageId: 'badName' }],
        },
        {
            code: '// bad',
            filename: 'tests/playwright/settings/show-tab-indices.spec.ts',
            errors: [{ messageId: 'badName' }],
        },
        {
            code: '// bad',
            filename: 'tests/playwright/settings/setting-ScrollSize.spec.ts',
            errors: [{ messageId: 'badName' }],
        },
        {
            code: '// bad',
            filename: 'tests/playwright/settings/Setting-scroll.spec.ts',
            errors: [{ messageId: 'badName' }],
        },
        {
            code: '// bad',
            filename: 'tests/playwright/settings/setting-.spec.ts',
            errors: [{ messageId: 'badName' }],
        },
    ],
});

console.log('settings-spec-naming-convention: all tests passed');
