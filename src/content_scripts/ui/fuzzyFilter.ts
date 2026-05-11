/**
 * Fuzzy filter for help menu search
 * Uses fzf-like sequential character matching with scoring
 */

/**
 * fzf-like fuzzy match with scoring
 * Characters must appear in sequence (not necessarily contiguous)
 *
 * @param {string} text - Text to search in
 * @param {string} query - Search query
 * @returns {{match: boolean, score: number, positions: number[]}} - Match result with score
 */
export function fuzzyMatch(text, query) {
    if (!query || query.trim() === '') return { match: true, score: 0, positions: [] };
    if (!text) return { match: false, score: -1, positions: [] };

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase().trim();

    // Sequential character matching
    let queryIdx = 0;
    let score = 0;
    let lastMatchIdx = -1;
    const positions = [];

    for (let i = 0; i < lowerText.length && queryIdx < lowerQuery.length; i++) {
        if (lowerText[i] === lowerQuery[queryIdx]) {
            positions.push(i);

            // Scoring bonuses
            if (lastMatchIdx === i - 1) {
                // Consecutive match bonus
                score += 15;
            }

            // Word boundary bonus (start of word)
            if (i === 0 || /[\s\-_\/\.]/.test(text[i - 1])) {
                score += 10;
            }

            // Camel case bonus
            if (i > 0 && /[a-z]/.test(text[i - 1]) && /[A-Z]/.test(text[i])) {
                score += 8;
            }

            // Base score for each match
            score += 1;

            lastMatchIdx = i;
            queryIdx++;
        }
    }

    // All query characters must be found
    const match = queryIdx === lowerQuery.length;

    // Bonus for shorter text (prefer more specific matches)
    if (match) {
        score += Math.max(0, 50 - text.length);
    }

    return { match, score: match ? score : -1, positions };
}

/**
 * Simple boolean fuzzy match (for backwards compatibility)
 * @param {string} text - Text to search in
 * @param {string} query - Search query
 * @returns {boolean} - Whether the text matches
 */
export function fuzzyMatchBool(text, query) {
    return fuzzyMatch(text, query).match;
}

/**
 * Create and setup fuzzy filter for help menu
 * @param {HTMLElement} usageContainer - The #sk_usage container
 * @returns {Object} - Filter API with { searchInput, filter, destroy }
 */
export function setupHelpFilter(usageContainer) {
    if (!usageContainer) return null;

    // Check if already setup
    const existingSearch = usageContainer.querySelector('#sk_fuzzy_search');
    if (existingSearch) {
        return { searchInput: existingSearch, filter: window._skFuzzyFilter, destroy: () => {} };
    }

    // Get all group wrappers (direct children of #sk_usage, excluding non-div elements like <p>)
    const groupWrappers = Array.from(usageContainer.querySelectorAll(':scope > div'));
    if (groupWrappers.length === 0) return null;

    // Create search input
    const searchInput = document.createElement('input');
    searchInput.id = 'sk_fuzzy_search';
    searchInput.type = 'text';
    searchInput.placeholder = 'Type to filter commands...';
    searchInput.style.cssText = `
        width: calc(100% - 20px);
        margin: 10px;
        padding: 10px 14px;
        font-size: 14px;
        border: 2px solid #4CAF50;
        border-radius: 6px;
        outline: none;
        background: var(--sk-bg, #1a1a1a);
        color: var(--sk-fg, #fff);
        font-family: monospace;
        box-sizing: border-box;
    `;

    // Parse all help items from ALL groups
    const allItems = [];
    const allGroupData = [];  // Track group wrappers and their headers

    groupWrappers.forEach((groupWrapper, groupIdx) => {
        const children = Array.from(groupWrapper.querySelectorAll(':scope > div'));
        let headerDiv = null;
        let categoryName = '';

        children.forEach((div) => {
            if (div.classList.contains('feature_name')) {
                headerDiv = div;
                categoryName = div.querySelector('span')?.textContent || '';
            } else {
                const kbd = div.querySelector('.kbd-span kbd')?.textContent || '';
                const annotation = div.querySelector('.annotation')?.textContent || '';

                if (kbd && annotation) {
                    allItems.push({
                        groupIndex: groupIdx,
                        categoryName,
                        kbd,
                        annotation,
                        item: div
                    });
                }
            }
        });

        allGroupData.push({ wrapper: groupWrapper, header: headerDiv, categoryName });
    });

    console.log('[SK Fuzzy] Parsed', allItems.length, 'items from', groupWrappers.length, 'groups');

    // Filter function with fzf-like scoring
    function filter(query) {
        console.log('[SK Fuzzy] filter called with:', query, 'items:', allItems.length);
        const groupVisibility = new Set();

        // Score all items
        const scored = allItems.map(itemData => {
            const result = fuzzyMatch(itemData.annotation, query);
            return { ...itemData, ...result };
        });

        // Sort by score (highest first) for matched items
        const matched = scored.filter(s => s.match);
        matched.sort((a, b) => b.score - a.score);
        console.log('[SK Fuzzy] matched:', matched.length, 'of', scored.length);

        // Hide all items first
        allItems.forEach(itemData => {
            itemData.item.style.display = 'none';
        });

        // Show matched items and track which groups have visible items
        matched.forEach(itemData => {
            itemData.item.style.display = '';
            groupVisibility.add(itemData.groupIndex);
        });

        // Show/hide entire group wrappers based on whether they have visible items
        allGroupData.forEach((group, idx) => {
            if (groupVisibility.has(idx)) {
                group.wrapper.style.display = '';
                if (group.header) group.header.style.display = '';
            } else {
                group.wrapper.style.display = 'none';
            }
        });

        return { total: allItems.length, visible: matched.length };
    }

    // Store globally for debugging
    window._skFuzzyFilter = filter;

    // Event listener
    const onInput = (e) => filter(e.target.value);
    searchInput.addEventListener('input', onInput);

    // Keyboard handler
    const onKeydown = (e) => {
        // Ctrl+F to focus search when help is visible
        if (e.ctrlKey && e.key === 'f' && usageContainer.style.display !== 'none') {
            e.preventDefault();
            e.stopPropagation();
            searchInput.focus();
            searchInput.select();
        }
        // ESC to clear search (only when focused on search)
        if (e.key === 'Escape' && document.activeElement === searchInput) {
            e.stopPropagation();
            searchInput.value = '';
            filter('');
        }
    };
    document.addEventListener('keydown', onKeydown, true);

    // Insert search input at the top (before first group wrapper)
    usageContainer.insertBefore(searchInput, groupWrappers[0]);

    // Cleanup function
    function destroy() {
        searchInput.removeEventListener('input', onInput);
        document.removeEventListener('keydown', onKeydown, true);
        searchInput.remove();
        delete window._skFuzzyFilter;
    }

    return { searchInput, filter, destroy, itemCount: allItems.length };
}
