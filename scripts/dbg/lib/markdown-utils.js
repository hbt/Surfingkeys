/**
 * Markdown Utilities
 *
 * Utilities for formatting Markdown tables to mirror the behavior of
 * FormatMarkdownTable() from /home/hassen/.config/nvim/lua/functions/markdown.lua.
 *
 * The Lua implementation handles wrapped rows, escaped pipes, and computes
 * display width using vim.fn.strdisplaywidth(). The helpers here provide the
 * same functionality for CLI scripts so table output always matches what users
 * see inside Neovim.
 */

const ESCAPED_PIPE_TOKEN = '◆ESCAPEDPIPE◆';
const EMOJI_REGEX = /\p{Extended_Pictographic}/u;

const COMBINING_RANGES = [
    [0x0300, 0x036F],
    [0x0483, 0x0489],
    [0x0591, 0x05BD],
    [0x05BF, 0x05BF],
    [0x05C1, 0x05C2],
    [0x05C4, 0x05C5],
    [0x05C7, 0x05C7],
    [0x0610, 0x061A],
    [0x064B, 0x065F],
    [0x0670, 0x0670],
    [0x06D6, 0x06DD],
    [0x06DF, 0x06E4],
    [0x06E7, 0x06E8],
    [0x06EA, 0x06ED],
    [0x0711, 0x0711],
    [0x0730, 0x074A],
    [0x07A6, 0x07B0],
    [0x07EB, 0x07F3],
    [0x07FD, 0x07FD],
    [0x0816, 0x0819],
    [0x081B, 0x0823],
    [0x0825, 0x0827],
    [0x0829, 0x082D],
    [0x0859, 0x085B],
    [0x08D3, 0x08E1],
    [0x08E3, 0x0902],
    [0x093A, 0x093A],
    [0x093C, 0x093C],
    [0x0941, 0x0948],
    [0x094D, 0x094D],
    [0x0951, 0x0957],
    [0x0962, 0x0963],
    [0x0981, 0x0981],
    [0x09BC, 0x09BC],
    [0x09C1, 0x09C4],
    [0x09CD, 0x09CD],
    [0x09E2, 0x09E3],
    [0x0A01, 0x0A02],
    [0x0A3C, 0x0A3C],
    [0x0A41, 0x0A42],
    [0x0A47, 0x0A48],
    [0x0A4B, 0x0A4D],
    [0x0A51, 0x0A51],
    [0x0A70, 0x0A71],
    [0x0A75, 0x0A75],
    [0x0A81, 0x0A82],
    [0x0ABC, 0x0ABC],
    [0x0AC1, 0x0AC5],
    [0x0AC7, 0x0AC8],
    [0x0ACD, 0x0ACD],
    [0x0AE2, 0x0AE3],
    [0x0B01, 0x0B01],
    [0x0B3C, 0x0B3C],
    [0x0B3F, 0x0B3F],
    [0x0B41, 0x0B44],
    [0x0B4D, 0x0B4D],
    [0x0B56, 0x0B56],
    [0x0B62, 0x0B63],
    [0x0B82, 0x0B82],
    [0x0BC0, 0x0BC0],
    [0x0BCD, 0x0BCD],
    [0x0C00, 0x0C00],
    [0x0C04, 0x0C04],
    [0x0C3E, 0x0C40],
    [0x0C46, 0x0C48],
    [0x0C4A, 0x0C4D],
    [0x0C55, 0x0C56],
    [0x0C62, 0x0C63],
    [0x0C81, 0x0C81],
    [0x0CBC, 0x0CBC],
    [0x0CBF, 0x0CBF],
    [0x0CC6, 0x0CC6],
    [0x0CCC, 0x0CCD],
    [0x0CE2, 0x0CE3],
    [0x0D00, 0x0D01],
    [0x0D3B, 0x0D3C],
    [0x0D41, 0x0D44],
    [0x0D4D, 0x0D4D],
    [0x0D62, 0x0D63],
    [0x0D81, 0x0D81],
    [0x0DCA, 0x0DCA],
    [0x0DD2, 0x0DD4],
    [0x0DD6, 0x0DD6],
    [0x0E31, 0x0E31],
    [0x0E34, 0x0E3A],
    [0x0E47, 0x0E4E],
    [0x0EB1, 0x0EB1],
    [0x0EB4, 0x0EB9],
    [0x0EBB, 0x0EBC],
    [0x0EC8, 0x0ECD],
    [0x0F18, 0x0F19],
    [0x0F35, 0x0F35],
    [0x0F37, 0x0F37],
    [0x0F39, 0x0F39],
    [0x0F71, 0x0F7E],
    [0x0F80, 0x0F84],
    [0x0F86, 0x0F87],
    [0x0F8D, 0x0F97],
    [0x0F99, 0x0FBC],
    [0x0FC6, 0x0FC6],
    [0x102D, 0x1030],
    [0x1032, 0x1037],
    [0x1039, 0x103A],
    [0x103D, 0x103E],
    [0x1058, 0x1059],
    [0x105E, 0x1060],
    [0x1071, 0x1074],
    [0x1082, 0x1082],
    [0x1085, 0x1086],
    [0x108D, 0x108D],
    [0x109D, 0x109D],
    [0x135D, 0x135F],
    [0x1712, 0x1714],
    [0x1732, 0x1733],
    [0x1752, 0x1753],
    [0x1772, 0x1773],
    [0x17B4, 0x17B5],
    [0x17B7, 0x17BD],
    [0x17C6, 0x17C6],
    [0x17C9, 0x17D3],
    [0x17DD, 0x17DD],
    [0x180B, 0x180D],
    [0x180F, 0x180F],
    [0x1885, 0x1886],
    [0x18A9, 0x18A9],
    [0x1920, 0x1922],
    [0x1927, 0x1928],
    [0x1932, 0x1932],
    [0x1939, 0x193B],
    [0x1A17, 0x1A18],
    [0x1A1B, 0x1A1B],
    [0x1A56, 0x1A56],
    [0x1A58, 0x1A5E],
    [0x1A60, 0x1A60],
    [0x1A62, 0x1A62],
    [0x1A65, 0x1A6C],
    [0x1A73, 0x1A7C],
    [0x1A7F, 0x1A7F],
    [0x1AB0, 0x1AC0],
    [0x1B00, 0x1B03],
    [0x1B34, 0x1B34],
    [0x1B36, 0x1B3A],
    [0x1B3C, 0x1B3C],
    [0x1B42, 0x1B42],
    [0x1B6B, 0x1B73],
    [0x1B80, 0x1B81],
    [0x1BA2, 0x1BA5],
    [0x1BA8, 0x1BA9],
    [0x1BAB, 0x1BAD],
    [0x1BE6, 0x1BE6],
    [0x1BE8, 0x1BE9],
    [0x1BED, 0x1BED],
    [0x1BEF, 0x1BF1],
    [0x1C2C, 0x1C33],
    [0x1C36, 0x1C37],
    [0x1CD0, 0x1CD2],
    [0x1CD4, 0x1CE0],
    [0x1CE2, 0x1CE8],
    [0x1CED, 0x1CED],
    [0x1CF4, 0x1CF4],
    [0x1CF8, 0x1CF9],
    [0x1DC0, 0x1DF9],
    [0x1DFB, 0x1DFF],
    [0x200C, 0x200D],
    [0x20D0, 0x20DC],
    [0x20E1, 0x20E1],
    [0x20E5, 0x20F0],
    [0x2CEF, 0x2CF1],
    [0x2D7F, 0x2D7F],
    [0x2DE0, 0x2DFF],
    [0x302A, 0x302D],
    [0x302E, 0x302F],
    [0x3099, 0x309A],
    [0xA66F, 0xA672],
    [0xA674, 0xA67D],
    [0xA69E, 0xA69F],
    [0xA6F0, 0xA6F1],
    [0xA802, 0xA802],
    [0xA806, 0xA806],
    [0xA80B, 0xA80B],
    [0xA825, 0xA826],
    [0xA82C, 0xA82C],
    [0xA8C4, 0xA8C5],
    [0xA8E0, 0xA8F1],
    [0xA900, 0xA902],
    [0xA926, 0xA92D],
    [0xA947, 0xA951],
    [0xA980, 0xA982],
    [0xA9B3, 0xA9B3],
    [0xA9B6, 0xA9B9],
    [0xA9BC, 0xA9BC],
    [0xA9E5, 0xA9E5],
    [0xAA29, 0xAA2E],
    [0xAA31, 0xAA32],
    [0xAA35, 0xAA36],
    [0xAA43, 0xAA43],
    [0xAA4C, 0xAA4C],
    [0xAA7C, 0xAA7C],
    [0xAAB0, 0xAAB0],
    [0xAAB2, 0xAAB4],
    [0xAAB7, 0xAAB8],
    [0xAABE, 0xAABF],
    [0xAAC1, 0xAAC1],
    [0xAAEC, 0xAAED],
    [0xAAF6, 0xAAF6],
    [0xABE5, 0xABE5],
    [0xABE8, 0xABE8],
    [0xABED, 0xABED],
    [0xFB1E, 0xFB1E],
    [0xFE00, 0xFE0F],
    [0xFE20, 0xFE2F],
    [0x101FD, 0x101FD],
    [0x102E0, 0x102E0],
    [0x10376, 0x1037A],
    [0x10A01, 0x10A03],
    [0x10A05, 0x10A06],
    [0x10A0C, 0x10A0F],
    [0x10A38, 0x10A3A],
    [0x10A3F, 0x10A3F],
    [0x10AE5, 0x10AE6],
    [0x10D24, 0x10D27],
    [0x10EAB, 0x10EAC],
    [0x10EFD, 0x10EFF],
    [0x10F46, 0x10F50],
    [0x10F82, 0x10F85],
    [0x11001, 0x11001],
    [0x11038, 0x11046],
    [0x1107F, 0x11081],
    [0x110B3, 0x110B6],
    [0x110B9, 0x110BA],
    [0x11100, 0x11102],
    [0x11127, 0x1112B],
    [0x1112D, 0x11134],
    [0x11173, 0x11173],
    [0x11180, 0x11181],
    [0x111B6, 0x111BE],
    [0x111CA, 0x111CC],
    [0x1122F, 0x11231],
    [0x11234, 0x11234],
    [0x11236, 0x11237],
    [0x1123E, 0x1123E],
    [0x112DF, 0x112DF],
    [0x112E3, 0x112EA],
    [0x11300, 0x11301],
    [0x1133B, 0x1133C],
    [0x11340, 0x11340],
    [0x11366, 0x1136C],
    [0x11370, 0x11374],
    [0x11438, 0x1143F],
    [0x11442, 0x11444],
    [0x11446, 0x11446],
    [0x1145E, 0x1145E],
    [0x114B3, 0x114B8],
    [0x114BA, 0x114BA],
    [0x114BF, 0x114C0],
    [0x114C2, 0x114C3],
    [0x115B2, 0x115B5],
    [0x115BC, 0x115BD],
    [0x115BF, 0x115C0],
    [0x115DC, 0x115DD],
    [0x11633, 0x1163A],
    [0x1163D, 0x1163D],
    [0x1163F, 0x11640],
    [0x116AB, 0x116AB],
    [0x116AD, 0x116AD],
    [0x116B0, 0x116B5],
    [0x116B7, 0x116B7],
    [0x1171D, 0x1171F],
    [0x11722, 0x11725],
    [0x11727, 0x1172B],
    [0x1182F, 0x11837],
    [0x11839, 0x1183A],
    [0x1193B, 0x1193C],
    [0x1193E, 0x1193E],
    [0x11943, 0x11943],
    [0x119D4, 0x119D7],
    [0x119DA, 0x119DB],
    [0x119E0, 0x119E0],
    [0x11A01, 0x11A0A],
    [0x11A33, 0x11A38],
    [0x11A3B, 0x11A3E],
    [0x11A47, 0x11A47],
    [0x11A51, 0x11A56],
    [0x11A59, 0x11A5B],
    [0x11A8A, 0x11A96],
    [0x11A98, 0x11A99],
    [0x11C30, 0x11C36],
    [0x11C38, 0x11C3D],
    [0x11C3F, 0x11C3F],
    [0x11C92, 0x11CA7],
    [0x11CAA, 0x11CB0],
    [0x11CB2, 0x11CB3],
    [0x11CB5, 0x11CB6],
    [0x11D31, 0x11D36],
    [0x11D3A, 0x11D3A],
    [0x11D3C, 0x11D3D],
    [0x11D3F, 0x11D45],
    [0x11D47, 0x11D47],
    [0x11D90, 0x11D91],
    [0x11D95, 0x11D95],
    [0x11D97, 0x11D97],
    [0x11EF3, 0x11EF4],
    [0x11F00, 0x11F01],
    [0x11F36, 0x11F3A],
    [0x11F40, 0x11F40],
    [0x11F42, 0x11F42],
    [0x13430, 0x13438],
    [0x16AF0, 0x16AF4],
    [0x16B30, 0x16B36],
    [0x16F4F, 0x16F4F],
    [0x16F8F, 0x16F92],
    [0x16FE4, 0x16FE4],
    [0x1BC9D, 0x1BC9E],
    [0x1CF00, 0x1CF2D],
    [0x1CF30, 0x1CF46],
    [0x1D165, 0x1D169],
    [0x1D16D, 0x1D172],
    [0x1D17B, 0x1D182],
    [0x1D185, 0x1D18B],
    [0x1D1AA, 0x1D1AD],
    [0x1D242, 0x1D244],
    [0x1DA00, 0x1DA36],
    [0x1DA3B, 0x1DA6C],
    [0x1DA75, 0x1DA75],
    [0x1DA84, 0x1DA84],
    [0x1DA9B, 0x1DA9F],
    [0x1DAA1, 0x1DAAF],
    [0x1E000, 0x1E006],
    [0x1E008, 0x1E018],
    [0x1E01B, 0x1E021],
    [0x1E023, 0x1E024],
    [0x1E026, 0x1E02A],
    [0x1E130, 0x1E136],
    [0x1E2AE, 0x1E2AE],
    [0x1E2EC, 0x1E2EF],
    [0x1E4EC, 0x1E4EF],
    [0x1E8D0, 0x1E8D6],
    [0x1E944, 0x1E94A],
    [0xE0100, 0xE01EF]
];

/**
 * Determine if code point is combining (zero-width)
 */
function isCombining(codePoint) {
    for (const [start, end] of COMBINING_RANGES) {
        if (codePoint >= start && codePoint <= end) {
            return true;
        }
    }
    return false;
}

/**
 * Determine if code point should be treated as full width.
 * Based on wcwidth implementation and unicode east asian width rules.
 */
function isFullWidth(codePoint) {
    if (codePoint >= 0x1100 && (
        codePoint <= 0x115F ||
        codePoint === 0x2329 ||
        codePoint === 0x232A ||
        (codePoint >= 0x2E80 && codePoint <= 0x3247 && codePoint !== 0x303F) ||
        (codePoint >= 0x3250 && codePoint <= 0x4DBF) ||
        (codePoint >= 0x4E00 && codePoint <= 0xA4C6) ||
        (codePoint >= 0xA960 && codePoint <= 0xA97C) ||
        (codePoint >= 0xAC00 && codePoint <= 0xD7A3) ||
        (codePoint >= 0xF900 && codePoint <= 0xFAFF) ||
        (codePoint >= 0xFE10 && codePoint <= 0xFE19) ||
        (codePoint >= 0xFE30 && codePoint <= 0xFE6B) ||
        (codePoint >= 0xFF01 && codePoint <= 0xFF60) ||
        (codePoint >= 0xFFE0 && codePoint <= 0xFFE6) ||
        (codePoint >= 0x1F300 && codePoint <= 0x1F64F) ||
        (codePoint >= 0x1F900 && codePoint <= 0x1F9FF) ||
        (codePoint >= 0x20000 && codePoint <= 0x3FFFD)
    )) {
        return true;
    }
    return false;
}

/**
 * Calculate display width similar to vim.fn.strdisplaywidth()
 * Accounts for emoji, wide glyphs, and combining marks.
 *
 * @param {string} str
 * @returns {number}
 */
function getDisplayWidth(str) {
    if (!str) return 0;

    let width = 0;
    for (const char of [...str]) {
        const codePoint = char.codePointAt(0);
        if (codePoint === undefined) continue;

        // Control chars, zero width joiner/space, combining marks → width 0
        if (
            codePoint <= 0x1F ||
            codePoint === 0x200B ||
            codePoint === 0x200C ||
            codePoint === 0x200D ||
            codePoint === 0x2060 ||
            codePoint === 0xFEFF ||
            isCombining(codePoint)
        ) {
            continue;
        }

        // Regional indicator symbols combine into flag emoji (2 columns)
        if (codePoint >= 0x1F1E6 && codePoint <= 0x1F1FF) {
            width += 2;
            continue;
        }

        width += isFullWidth(codePoint) ? 2 : 1;
    }

    return width;
}

function toLines(input) {
    if (!input) return [];
    if (typeof input === 'string') {
        return input.split(/\r?\n/);
    }
    if (Array.isArray(input)) {
        const clone = input.slice();
        if (clone.every(value => typeof value === 'string')) {
            return clone;
        }
    }
    return [];
}

function mergeWrappedRows(lines) {
    const merged = [];
    let currentRow = '';

    for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (trimmed === '') continue;

        if (currentRow !== '' && !/\|\s*$/.test(currentRow)) {
            currentRow = `${currentRow} ${trimmed}`;
        } else {
            if (currentRow !== '') {
                merged.push(currentRow);
            }
            currentRow = trimmed;
        }
    }

    if (currentRow !== '') {
        merged.push(currentRow);
    }

    return merged;
}

function splitRowIntoCells(line) {
    const protectedLine = line.replace(/\\\|/g, ESCAPED_PIPE_TOKEN);
    const matches = protectedLine.match(/[^|]+/g) || [];
    const rawCells = matches.map(cell => cell.trim());

    if (rawCells.length && rawCells[0] === '') {
        rawCells.shift();
    }
    if (rawCells.length && rawCells[rawCells.length - 1] === '') {
        rawCells.pop();
    }

    return rawCells.map(cell => cell.replace(new RegExp(ESCAPED_PIPE_TOKEN, 'g'), '\\|'));
}

function parseLinesToRows(lines) {
    const merged = mergeWrappedRows(lines);
    const rows = [];

    for (const line of merged) {
        const cells = splitRowIntoCells(line);
        if (cells.length > 0) {
            rows.push(cells);
        }
    }

    return rows;
}

function normalizeRows(input) {
    if (!input) return [];

    if (typeof input === 'string') {
        return parseLinesToRows(toLines(input));
    }

    if (Array.isArray(input) && input.length > 0) {
        if (Array.isArray(input[0])) {
            return input.map(row => row.map(cell => cell == null ? '' : String(cell)));
        }

        if (typeof input[0] === 'string') {
            return parseLinesToRows(input);
        }
    }

    return [];
}

function isSeparatorRow(row) {
    if (!row || row.length === 0) return false;
    return row.every(cell => {
        const value = cell || '';
        return /^-+$/.test(value);
    });
}

function detectEmojiColumns(rows, numCols) {
    const hasEmoji = new Array(numCols).fill(false);
    rows.forEach(row => {
        if (!row) return;
        for (let i = 0; i < numCols; i++) {
            if (hasEmoji[i]) continue;
            const cell = row[i];
            if (cell && EMOJI_REGEX.test(cell)) {
                hasEmoji[i] = true;
            }
        }
    });
    return hasEmoji;
}

/**
 * Format rows into aligned Markdown table lines.
 */
function formatRows(rows) {
    if (rows.length === 0) return [];

    const numCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const colWidths = new Array(numCols).fill(0);
    const headerRowIndex = rows.length > 1 && isSeparatorRow(rows[1]) ? 0 : -1;
    const emojiColumns = headerRowIndex === -1 ? new Array(numCols).fill(false) : detectEmojiColumns(rows, numCols);

    for (const row of rows) {
        for (let i = 0; i < numCols; i++) {
            const cell = row[i] || '';
            colWidths[i] = Math.max(colWidths[i], getDisplayWidth(cell));
        }
    }

    return rows.map((row, rowIdx) => {
        const formattedCells = [];
        const separatorRow = isSeparatorRow(row);

        for (let i = 0; i < numCols; i++) {
            let cell = row[i] || '';
            const cellWidth = getDisplayWidth(cell);
            const padding = colWidths[i] - cellWidth;
            const needsAdjust = headerRowIndex !== -1 && emojiColumns[i];
            const isHeader = needsAdjust && rowIdx === headerRowIndex;
            const isHeaderSeparator = needsAdjust && separatorRow && rowIdx === headerRowIndex + 1;

            if (/^\-+$/.test(cell)) {
                const widthWithAdjust = Math.max(colWidths[i] + (isHeaderSeparator ? 1 : 0), 3);
                cell = '-'.repeat(widthWithAdjust);
            } else {
                const totalPadding = Math.max(0, padding + (isHeader ? 1 : 0));
                cell = cell + ' '.repeat(totalPadding);
            }

            formattedCells.push(cell);
        }

        return `| ${formattedCells.join(' | ')} |`;
    });
}

/**
 * Format Markdown table input (string table text or array of rows) so the
 * columns align just like the Neovim Lua helper.
 *
 * @param {string | string[] | string[][]} input
 * @returns {string}
 */
function formatMarkdownTable(input) {
    const rows = normalizeRows(input);
    if (rows.length === 0) return '';
    return formatRows(rows).join('\n');
}

module.exports = {
    getDisplayWidth,
    formatMarkdownTable
};
