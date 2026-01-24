/**
 * Jest Setup for CDP Tests
 *
 * Runs before each test file to configure the test environment.
 */

// Extend Jest timeout for all CDP tests
jest.setTimeout(30000);

// Console mocking disabled for debugging
// if (!process.env.VERBOSE) {
//     const mockFn = () => {};
//     global.console = {
//         ...console,
//         log: mockFn,
//         debug: mockFn,
//         info: mockFn,
//         // Keep warnings and errors
//         warn: console.warn,
//         error: console.error
//     };
// }
