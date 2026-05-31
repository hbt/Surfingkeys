export {};

interface HelpEntry { key: string; unique_id: string; mode: string; category: string; description: string; }

const MODE_ORDER = ['Normal', 'Visual', 'Insert'];

function isPlaceholder(key: string): boolean {
    return !key || /^g-\d{3}$/.test(key);
}

function appendRow(tbody: HTMLElement, entry: HelpEntry) {
    const tr = document.createElement('tr');

    const tdKey = document.createElement('td');
    const hasMapping = !isPlaceholder(entry.key);
    tdKey.textContent = hasMapping ? entry.key : 'N/A';
    tdKey.className = hasMapping ? 'col-key' : 'col-key col-key-na';

    const tdId = document.createElement('td');
    tdId.textContent = entry.unique_id;

    const tdDesc = document.createElement('td');
    tdDesc.textContent = entry.description;

    tr.appendChild(tdKey);
    tr.appendChild(tdId);
    tr.appendChild(tdDesc);
    tbody.appendChild(tr);
}

function appendGroupHeader(tbody: HTMLElement, text: string, className: string) {
    const tr = document.createElement('tr');
    tr.className = className;
    const th = document.createElement('th');
    th.colSpan = 3;
    th.textContent = text;
    tr.appendChild(th);
    tbody.appendChild(tr);
}

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['sk_help_commands'], (result) => {
        const commands: HelpEntry[] = result['sk_help_commands'] || [];
        const tbody = document.getElementById('sk_help_tbody')!;

        // Group: mode → category → entries
        const grouped = new Map<string, Map<string, HelpEntry[]>>();
        for (const entry of commands) {
            const mode = entry.mode || 'Normal';
            const cat = entry.category || 'misc';
            if (!grouped.has(mode)) grouped.set(mode, new Map());
            const byMode = grouped.get(mode)!;
            if (!byMode.has(cat)) byMode.set(cat, []);
            byMode.get(cat)!.push(entry);
        }

        // Render in mode order (known modes first, then any others alphabetically)
        const modeKeys = [
            ...MODE_ORDER.filter(m => grouped.has(m)),
            ...[...grouped.keys()].filter(m => !MODE_ORDER.includes(m)).sort(),
        ];

        for (const mode of modeKeys) {
            appendGroupHeader(tbody, mode, 'group-mode');
            const byMode = grouped.get(mode)!;
            const categories = [...byMode.keys()].sort();
            for (const cat of categories) {
                appendGroupHeader(tbody, cat, 'group-category');
                for (const entry of byMode.get(cat)!) {
                    appendRow(tbody, entry);
                }
            }
        }
    });
});
