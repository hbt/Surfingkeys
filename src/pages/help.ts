export {};

import { fuzzyMatch } from '../content_scripts/ui/fuzzyFilter';

interface HelpEntry { key: string; unique_id: string; mode: string; category: string; description: string; }
interface RenderedRow { tr: HTMLTableRowElement; key: string; uid: string; desc: string; }

const MODE_ORDER = ['Normal', 'Visual', 'Insert'];
const renderedRows: RenderedRow[] = [];

function isPlaceholder(key: string): boolean {
    return !key || /^g-\d{3}$/.test(key);
}

function renderKey(td: HTMLTableCellElement, key: string) {
    if (!key || key === 'N/A') { td.textContent = key || 'N/A'; return; }
    const parts = key.match(/<[^>]+>|./g) ?? [key];
    for (const part of parts) {
        const kbd = document.createElement('kbd');
        kbd.textContent = part;
        td.appendChild(kbd);
    }
}

function appendRow(tbody: HTMLElement, entry: HelpEntry) {
    const tr = document.createElement('tr');

    const tdKey = document.createElement('td');
    const hasMapping = !isPlaceholder(entry.key);
    tdKey.className = hasMapping ? 'col-key' : 'col-key col-key-na';
    renderKey(tdKey, hasMapping ? entry.key : 'N/A');

    const tdId = document.createElement('td');
    tdId.textContent = entry.unique_id;
    tdId.className = 'col-uid';
    if (entry.unique_id) {
        tdId.title = 'Click to copy';
        tdId.addEventListener('click', () => {
            navigator.clipboard.writeText(entry.unique_id).then(() => {
                tdId.classList.add('copied');
                setTimeout(() => tdId.classList.remove('copied'), 800);
            });
        });
    }

    const tdDesc = document.createElement('td');
    tdDesc.textContent = entry.description;

    tr.appendChild(tdKey);
    tr.appendChild(tdId);
    tr.appendChild(tdDesc);
    tbody.appendChild(tr);

    renderedRows.push({ tr, key: hasMapping ? entry.key : 'N/A', uid: entry.unique_id, desc: entry.description });
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

function updateGroupVisibility() {
    const tbody = document.getElementById('sk_help_tbody')!;
    const children = Array.from(tbody.children) as HTMLElement[];
    let i = children.length - 1;
    while (i >= 0) {
        const el = children[i] as HTMLTableRowElement;
        if (el.classList.contains('group-mode') || el.classList.contains('group-category')) {
            let hasVisible = false;
            for (let j = i + 1; j < children.length; j++) {
                const sib = children[j] as HTMLTableRowElement;
                if (sib.classList.contains('group-mode') || sib.classList.contains('group-category')) break;
                if (sib.style.display !== 'none') { hasVisible = true; break; }
            }
            el.style.display = hasVisible ? '' : 'none';
        }
        i--;
    }
}

function applyFilters() {
    const fKey  = (document.getElementById('filter-mapping') as HTMLInputElement).value;
    const fUid  = (document.getElementById('filter-uid')     as HTMLInputElement).value;
    const fDesc = (document.getElementById('filter-desc')    as HTMLInputElement).value;
    const hideUnmapped = (document.getElementById('toggle-unmapped') as HTMLInputElement).checked;

    for (const row of renderedRows) {
        const visible =
            fuzzyMatch(row.key,  fKey).match &&
            fuzzyMatch(row.uid,  fUid).match &&
            fuzzyMatch(row.desc, fDesc).match &&
            (!hideUnmapped || row.key !== 'N/A');
        row.tr.style.display = visible ? '' : 'none';
    }
    updateGroupVisibility();

    const visibleCount = renderedRows.filter(r => r.tr.style.display !== 'none').length;
    const totalCount = renderedRows.length;
    const countEl = document.getElementById('sk_help_count');
    if (countEl) countEl.textContent = `${visibleCount} / ${totalCount} commands`;
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

        ['filter-mapping', 'filter-uid', 'filter-desc'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', applyFilters);
        });
        document.getElementById('toggle-unmapped')?.addEventListener('change', applyFilters);

        // Initial count
        applyFilters();
    });
});
