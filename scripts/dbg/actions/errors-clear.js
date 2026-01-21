/**
 * Errors Clear Action
 *
 * Alias for clear-errors action.
 * Provides consistent naming with errors-list command.
 */

const clearErrorsAction = require('./clear-errors');

module.exports = {
    run: clearErrorsAction.run
};
