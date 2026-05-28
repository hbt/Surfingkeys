'use strict';

/**
 * Known child-array keys for AST node types relevant to function bodies.
 * We enumerate these explicitly to avoid traversing circular parent references
 * that ESLint attaches to nodes at lint time.
 */
const CHILD_KEYS = {
    Program: ['body'],
    BlockStatement: ['body'],
    ExpressionStatement: ['expression'],
    CallExpression: ['callee', 'arguments'],
    MemberExpression: ['object', 'property'],
    AwaitExpression: ['argument'],
    ArrowFunctionExpression: ['body'],
    FunctionExpression: ['body'],
    ReturnStatement: ['argument'],
    IfStatement: ['test', 'consequent', 'alternate'],
    TryStatement: ['block', 'handler', 'finalizer'],
    CatchClause: ['param', 'body'],
    ForStatement: ['init', 'test', 'update', 'body'],
    ForOfStatement: ['left', 'right', 'body'],
    ForInStatement: ['left', 'right', 'body'],
    WhileStatement: ['test', 'body'],
    DoWhileStatement: ['body', 'test'],
    SwitchStatement: ['discriminant', 'cases'],
    SwitchCase: ['test', 'consequent'],
    LabeledStatement: ['body'],
    VariableDeclaration: ['declarations'],
    VariableDeclarator: ['id', 'init'],
    AssignmentExpression: ['left', 'right'],
    BinaryExpression: ['left', 'right'],
    LogicalExpression: ['left', 'right'],
    ConditionalExpression: ['test', 'consequent', 'alternate'],
    SequenceExpression: ['expressions'],
    UnaryExpression: ['argument'],
    SpreadElement: ['argument'],
    ArrayExpression: ['elements'],
    ObjectExpression: ['properties'],
    Property: ['key', 'value'],
    TemplateLiteral: ['expressions'],
    TaggedTemplateExpression: ['tag', 'quasi'],
    ChainExpression: ['expression'],
};

/**
 * Recursively collect all CallExpression nodes within a subtree
 * where the callee name (direct or property) matches `name`.
 * Uses explicit child-key enumeration to avoid circular reference stack overflow.
 */
function collectCalls(node, name, results = []) {
    if (!node || typeof node !== 'object' || !node.type) return results;

    if (node.type === 'CallExpression') {
        const calleeName = node.callee?.name || node.callee?.property?.name;
        if (calleeName === name) results.push(node);
    }

    const childKeys = CHILD_KEYS[node.type];
    if (!childKeys) return results;

    for (const key of childKeys) {
        const child = node[key];
        if (!child) continue;
        if (Array.isArray(child)) {
            for (const item of child) {
                collectCalls(item, name, results);
            }
        } else {
            collectCalls(child, name, results);
        }
    }

    return results;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Every test() block with applySetting() must also call restoreSetting()',
        },
        schema: [],
        messages: {
            missingRestore: 'test() block calls applySetting() but is missing restoreSetting() — settings must be restored to avoid test pollution',
        },
    },
    create(context) {
        return {
            CallExpression(node) {
                // Match test('title', async () => { ... }) or test('title', () => { ... })
                if (
                    node.callee.type !== 'Identifier' ||
                    node.callee.name !== 'test'
                ) return;

                // Must have at least 2 args, last arg must be a function
                if (node.arguments.length < 2) return;
                const lastArg = node.arguments[node.arguments.length - 1];
                if (
                    lastArg.type !== 'ArrowFunctionExpression' &&
                    lastArg.type !== 'FunctionExpression'
                ) return;

                // AST-based: walk the callback body for applySetting / restoreSetting calls
                const applyCalls = collectCalls(lastArg.body, 'applySetting');
                const restoreCalls = collectCalls(lastArg.body, 'restoreSetting');

                if (applyCalls.length > 0 && restoreCalls.length === 0) {
                    context.report({ node, messageId: 'missingRestore' });
                }
            },
        };
    },
};
