const typescriptEslintPlugin = require('@typescript-eslint/eslint-plugin');
const typescriptEslintParser = require('@typescript-eslint/parser');

module.exports = [
    {
        ignores: ['src/nvim/**', 'node_modules/**', 'dist/**']
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
                project: './tsconfig.json'
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
            // Phase 1 loose migration — relax TS-specific rules
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-var-requires': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-this-alias': 'off',
            '@typescript-eslint/no-unsafe-function-type': 'off',
            '@typescript-eslint/no-wrapper-object-types': 'off',
            '@typescript-eslint/no-unused-expressions': 'off'
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
    }
];
