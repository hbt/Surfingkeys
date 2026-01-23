/**
 * Markdown Utilities
 *
 * Table formatting functions that mirror the neovim lua implementation
 * from /home/hassen/.config/nvim/lua/functions/markdown.lua
 *
 * Uses display width calculation (vim.fn.strdisplaywidth equivalent)
 * to properly align markdown tables with emoji and wide characters.
 */

/**
 * Calculate display width of a string, accounting for wide characters and emoji
 * Equivalent to vim.fn.strdisplaywidth() in neovim
 *
 * Most emoji display as 2 columns wide, regular characters as 1 column
 *
 * @param {string} str - Input string
 * @returns {number} Display width in columns
 */
function getDisplayWidth(str) {
    let width = 0;
    for (const char of str) {
        const code = char.charCodeAt(0);

        // Check if it's a wide character or emoji
        // Emoji ranges: 1F600-1F64F (emoticons), 1F300-1F5FF (misc symbols),
        // 1F680-1F6FF (transport), 2600-26FF (misc symbols), 2700-27BF (dingbats)
        if (
            (code >= 0x1F300 && code <= 0x1F9FF) ||  // Emoji ranges
            (code >= 0x2600 && code <= 0x27BF) ||    // Symbols, Dingbats
            (code >= 0xFE00 && code <= 0xFE0F)       // Variation selectors
        ) {
            // Wide character / emoji = 2 columns
            width += 2;
        } else {
            // Regular ASCII and most Unicode = 1 column
            width += 1;
        }
    }
    return width;
}

/**
 * Format markdown table with proper alignment
 *
 * Mirrors the lua implementation from /home/hassen/.config/nvim/lua/functions/markdown.lua
 *
 * Algorithm:
 * 1. Calculate max display width for each column (accounting for emoji)
 * 2. For each row/cell:
 *    - Get cell's display width
 *    - Calculate padding = col_width - cell_width
 *    - If separator row (contains only dashes): repeat dashes for full column width
 *    - Otherwise: append padding spaces
 * 3. Format line with pipe separators
 *
 * @param {Array<Array<string>>} rows - Array of rows, each row is array of cell strings
 * @returns {string} Formatted markdown table
 */
function formatMarkdownTable(rows) {
    if (rows.length === 0) return '';

    const numCols = Math.max(...rows.map(r => r.length));

    // Calculate max display width for each column
    const colWidths = new Array(numCols).fill(0);

    for (const row of rows) {
        for (let i = 0; i < numCols; i++) {
            const cell = row[i] || '';
            const width = getDisplayWidth(cell);
            colWidths[i] = Math.max(colWidths[i], width);
        }
    }

    // Format each row
    const formattedLines = [];
    for (const row of rows) {
        const formattedCells = [];

        for (let i = 0; i < numCols; i++) {
            let cell = row[i] || '';
            const cellWidth = getDisplayWidth(cell);
            const padding = colWidths[i] - cellWidth;

            // Check if this is a separator row (contains only dashes)
            if (cell.match(/^-+$/)) {
                // Repeat dashes for the full column width
                cell = '-'.repeat(colWidths[i]);
            } else {
                // Left-align text with padding
                cell = cell + ' '.repeat(padding);
            }

            formattedCells.push(cell);
        }

        // Format line with pipe separators
        const formattedLine = '| ' + formattedCells.join(' | ') + ' |';
        formattedLines.push(formattedLine);
    }

    return formattedLines.join('\n');
}

module.exports = {
    getDisplayWidth,
    formatMarkdownTable
};
