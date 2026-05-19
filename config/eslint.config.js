const typescriptEslintPlugin = require('@typescript-eslint/eslint-plugin');
const typescriptEslintParser = require('@typescript-eslint/parser');
const playwrightPlugin = require('eslint-plugin-playwright');
const requireCustomCommandMapping = require('./eslint-rules/require-custom-command-mapping');

module.exports = [
    {
        ignores: ['src/nvim/**', 'node_modules/**', 'dist/**', 'tests/nvim/**']
    },
    {
        files: ['src/**/*.js', 'tests/**/*.js', 'debug/**/*.js', 'scripts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                // Browser globals
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                // Node globals
                process: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                module: 'readonly',
                require: 'readonly',
                exports: 'readonly',
                global: 'readonly',
                Buffer: 'readonly'
            }
        },
        rules: {
            'semi': ['error', 'always'],
            'no-tabs': 2
        }
    },
    {
        files: ['tests/**/*.js', 'tests/**/*.ts'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                // Browser globals
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                // Node globals
                process: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                module: 'readonly',
                require: 'readonly',
                exports: 'readonly',
                global: 'readonly',
                Buffer: 'readonly',
                // Jest globals
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                jest: 'readonly'
            }
        }
    },
    {
        files: ['src/**/*.ts', 'src/**/*.tsx', 'tests/**/*.ts', 'tests/**/*.tsx', 'debug/**/*.ts', 'debug/**/*.tsx', 'scripts/**/*.ts', 'scripts/**/*.tsx'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            parser: typescriptEslintParser,
            parserOptions: {
                project: ['./tsconfig.json', './tsconfig.scripts.json']
            },
            globals: {
                // Browser globals
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                // Node globals
                process: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                module: 'readonly',
                require: 'readonly',
                exports: 'readonly',
                global: 'readonly',
                Buffer: 'readonly',
                // Jest globals (for test files)
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                jest: 'readonly'
            }
        },
        plugins: {
            '@typescript-eslint': typescriptEslintPlugin
        },
        rules: {
            ...typescriptEslintPlugin.configs.recommended.rules,
            'semi': ['error', 'always'],
            'no-tabs': 2,
            // Disabled: too many violations to fix now
            '@typescript-eslint/no-explicit-any': 'off',
            // Restored with _ prefix ignore pattern
            '@typescript-eslint/no-unused-vars': ['error', {
                vars: 'all',
                args: 'after-used',
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_'
            }],
        }
    },
    {
        // Relaxed rules for debug scripts, tests, and utility scripts
        files: ['debug/**/*.ts', 'debug/**/*.tsx', 'debug/**/*.js',
                'tests/**/*.ts', 'tests/**/*.tsx', 'tests/**/*.js',
                'scripts/**/*.ts', 'scripts/**/*.tsx', 'scripts/**/*.js'],
        plugins: {
            '@typescript-eslint': typescriptEslintPlugin
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-require-imports': 'off'
        }
    },
    {
        files: ['tests/playwright/**/*.ts'],
        plugins: { playwright: playwrightPlugin },
        rules: {
            'playwright/expect-expect': ['error', { assertFunctionNames: ['withPersistedDualCoverage', 'expectClipboardForCommand', 'assertBasicCoverage'] }],
            'playwright/no-standalone-expect': 'error',
            'playwright/valid-expect': 'error',
            // Phase 1: confirmed zero-violation rules
            'playwright/no-focused-test': 'error',
            'playwright/missing-playwright-await': 'error',
            'playwright/valid-describe-callback': 'error',
            'playwright/no-unsafe-references': 'error',
        }
    },
    {
        files: ['tests/playwright/commands/**/*.spec.ts'],
        plugins: {
            local: {
                rules: { 'require-custom-command-mapping': requireCustomCommandMapping }
            }
        },
        rules: {
            'local/require-custom-command-mapping': 'error',
        }
    }
];
