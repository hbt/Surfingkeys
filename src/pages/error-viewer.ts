// Surfingkeys Error Viewer
// Displays errors captured by errorCollector.js
export {};

interface ErrorRecord {
  message: string;
  stack?: string;
  source?: string;
  context: string;
  type: string;
  timestamp: string;
  url?: string;
  lineno?: number;
  colno?: number;
  userAgent?: string;
}

let allErrors: ErrorRecord[] = [];

// Load errors from storage
async function loadErrors(): Promise<ErrorRecord[]> {
    return new Promise((resolve) => {
        chrome.storage.local.get(['surfingkeys_errors'], (result) => {
            resolve((result['surfingkeys_errors'] as ErrorRecord[]) || []);
        });
    });
}

// Update stats display
function updateStats() {
    const stats = document.getElementById('error-viewer-stats');
    if (stats) {
        stats.textContent = `${allErrors.length} ${allErrors.length === 1 ? 'error' : 'errors'} captured`;
    }
}

// Render error list
function renderErrors() {
    const list = document.getElementById('error-list');
    const searchEl = document.getElementById('error-viewer-search') as HTMLInputElement | null;
    const contextFilterEl = document.getElementById('filter-context') as HTMLSelectElement | null;
    const typeFilterEl = document.getElementById('filter-type') as HTMLSelectElement | null;
    const search = searchEl ? searchEl.value.toLowerCase() : '';
    const contextFilter = contextFilterEl ? contextFilterEl.value : '';
    const typeFilter = typeFilterEl ? typeFilterEl.value : '';

    // Filter errors
    let filtered = allErrors.slice().reverse(); // Newest first

    if (search) {
        filtered = filtered.filter(e =>
            e.message.toLowerCase().includes(search) ||
            (e.stack && e.stack.toLowerCase().includes(search)) ||
            (e.source && e.source.toLowerCase().includes(search))
        );
    }

    if (contextFilter) {
        filtered = filtered.filter(e => e.context === contextFilter);
    }

    if (typeFilter) {
        filtered = filtered.filter(e => e.type === typeFilter);
    }

    if (!list) return;

    // Render
    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <div>${allErrors.length === 0 ? 'No errors captured' : 'No errors match your filters'}</div>
            </div>
        `;
        return;
    }

    list.innerHTML = '';

    filtered.forEach((error, idx) => {
        const errorEl = createErrorElement(error, idx);
        list.appendChild(errorEl);
    });
}

// Create error element
function createErrorElement(error: ErrorRecord, idx: number) {
    const div = document.createElement('div');
    div.className = 'error-item';
    div.dataset['errorId'] = String(idx);

    // Determine type class
    const typeClass = error.type === 'window.onerror' ? 'error-type-onerror' :
                     error.type === 'unhandledrejection' ? 'error-type-rejection' :
                     error.type === 'chrome.runtime.lastError' ? 'error-type-lasterror' :
                     'error-type-manual';

    const timestamp = new Date(error.timestamp).toLocaleString();

    div.innerHTML = `
        <div class="error-item-header">
            <div>
                <span class="error-type ${typeClass}">${error.type}</span>
                <span class="error-context">${error.context}</span>
            </div>
            <div class="error-meta">
                <span>📅 ${timestamp}</span>
            </div>
        </div>
        <div class="error-message">${escapeHtml(error.message)}</div>
        <div class="error-meta">
            ${error.source ? `<span>📄 ${escapeHtml(error.source)}:${error.lineno}:${error.colno}</span>` : ''}
            ${error.url ? `<span>🔗 ${escapeHtml(error.url.substring(0, 60))}${error.url.length > 60 ? '...' : ''}</span>` : ''}
        </div>

        <div class="error-details">
            <div class="error-detail-row">
                <span class="error-detail-label">Timestamp:</span>
                <span class="error-detail-value">${error.timestamp}</span>
            </div>
            <div class="error-detail-row">
                <span class="error-detail-label">Context:</span>
                <span class="error-detail-value">${error.context}</span>
            </div>
            <div class="error-detail-row">
                <span class="error-detail-label">Type:</span>
                <span class="error-detail-value">${error.type}</span>
            </div>
            ${error.url ? `
            <div class="error-detail-row">
                <span class="error-detail-label">URL:</span>
                <span class="error-detail-value">${escapeHtml(error.url)}</span>
            </div>
            ` : ''}
            ${error.userAgent ? `
            <div class="error-detail-row">
                <span class="error-detail-label">User Agent:</span>
                <span class="error-detail-value">${escapeHtml(error.userAgent)}</span>
            </div>
            ` : ''}
            ${error.stack ? `
            <div class="error-detail-row">
                <div class="error-detail-label">Stack Trace:</div>
                <div class="error-stack">${escapeHtml(error.stack)}</div>
            </div>
            ` : ''}
            <div class="error-actions">
                <button class="error-copy-btn" data-error-idx="${idx}">📋 Copy Error JSON</button>
            </div>
        </div>
    `;

    // Toggle expand on click
    div.addEventListener('click', (e) => {
        // Don't toggle if clicking copy button
        const target = e.target as HTMLElement | null;
        if (target && target.classList.contains('error-copy-btn')) {
            return;
        }
        div.classList.toggle('expanded');
    });

    // Copy button handler
    const copyBtn = div.querySelector('.error-copy-btn') as HTMLButtonElement | null;
    if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const errorJson = JSON.stringify(error, null, 2);
            navigator.clipboard.writeText(errorJson).then(() => {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '✅ Copied!';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 2000);
            });
        });
    }

    return div;
}

// Escape HTML to prevent XSS
function escapeHtml(text: string) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Refresh errors
async function refresh() {
    allErrors = await loadErrors();
    updateStats();
    renderErrors();
}

// Export errors as JSON
function exportErrors() {
    const dataStr = JSON.stringify(allErrors, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `surfingkeys-errors-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Clear all errors
async function clearErrors() {
    if (!confirm(`Clear all ${allErrors.length} errors?`)) {
        return;
    }

    await new Promise<void>((resolve) => {
        chrome.storage.local.set({ surfingkeys_errors: [] }, resolve);
    });

    allErrors = [];
    updateStats();
    renderErrors();
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Load and render errors
    await refresh();

    // Event listeners
    document.getElementById('btn-refresh')?.addEventListener('click', refresh);
    document.getElementById('btn-export')?.addEventListener('click', exportErrors);
    document.getElementById('btn-clear')?.addEventListener('click', clearErrors);

    document.getElementById('error-viewer-search')?.addEventListener('input', renderErrors);
    document.getElementById('filter-context')?.addEventListener('change', renderErrors);
    document.getElementById('filter-type')?.addEventListener('change', renderErrors);
});
