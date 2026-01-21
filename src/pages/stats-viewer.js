// Surfingkeys Usage Statistics Viewer
// Displays command usage statistics from usageTracker

const STORAGE_KEY = 'surfingkeys_usage';
let usageData = null;

// Load usage data from storage
async function loadUsageData() {
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            resolve(result[STORAGE_KEY] || {
                commands: {},
                recentHistory: [],
                stats: {
                    totalInvocations: 0,
                    firstTracked: null,
                    lastTracked: null
                }
            });
        });
    });
}

// Update summary display
function updateSummary() {
    const summary = document.getElementById('stats-summary');
    const uniqueCommands = Object.keys(usageData.commands).length;
    const totalInvocations = usageData.stats.totalInvocations || 0;
    summary.textContent = `${totalInvocations} invocations across ${uniqueCommands} unique commands`;
}

// Render frequently used commands
function renderFrequent() {
    const container = document.getElementById('frequent-list');
    const commands = Object.entries(usageData.commands)
        .map(([key, data]) => ({ key, ...data }))
        .sort((a, b) => b.count - a.count);

    if (commands.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📊</div>
                <div>No command usage recorded yet</div>
                <div style="margin-top: 10px; color: #555;">Start using keyboard shortcuts to see statistics</div>
            </div>
        `;
        return;
    }

    const maxCount = commands[0]?.count || 1;

    container.innerHTML = commands.map(cmd => `
        <div class="command-item">
            <span class="command-key">${escapeHtml(cmd.key)}</span>
            <div class="command-info">
                <div class="command-annotation">${escapeHtml(cmd.annotation || 'Unknown command')}</div>
                <div class="command-meta">
                    Last used: ${formatDate(cmd.lastUsed)}
                    <span class="command-mode">${cmd.mode || 'Normal'}</span>
                </div>
                <div class="frequency-bar">
                    <div class="frequency-bar-fill" style="width: ${(cmd.count / maxCount) * 100}%"></div>
                </div>
            </div>
            <span class="command-count">${cmd.count}</span>
        </div>
    `).join('');
}

// Render recently used commands
function renderRecent() {
    const container = document.getElementById('recent-list');
    const recent = usageData.recentHistory || [];

    if (recent.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <div>No recent commands</div>
            </div>
        `;
        return;
    }

    container.innerHTML = recent.map(item => `
        <div class="recent-item">
            <span class="command-key">${escapeHtml(item.key)}</span>
            <div class="command-info">
                <div class="command-annotation">${escapeHtml(item.annotation || 'Unknown command')}</div>
                <span class="recent-url" title="${escapeHtml(item.url || '')}">${escapeHtml(truncateUrl(item.url || ''))}</span>
            </div>
            <span class="recent-time">${formatDate(item.timestamp)}</span>
        </div>
    `).join('');
}

// Render overview statistics
function renderOverview() {
    const container = document.getElementById('overview-content');
    const commands = Object.entries(usageData.commands)
        .map(([key, data]) => ({ key, ...data }));

    const totalInvocations = usageData.stats.totalInvocations || 0;
    const uniqueCommands = commands.length;
    const firstTracked = usageData.stats.firstTracked;
    const lastTracked = usageData.stats.lastTracked;

    // Calculate mode distribution
    const modeDistribution = {};
    commands.forEach(cmd => {
        const mode = cmd.mode || 'Normal';
        modeDistribution[mode] = (modeDistribution[mode] || 0) + cmd.count;
    });

    // Top 5 commands
    const top5 = commands.sort((a, b) => b.count - a.count).slice(0, 5);

    container.innerHTML = `
        <div class="overview-card">
            <h3>General Statistics</h3>
            <div class="stat-row">
                <span class="stat-label">Total Invocations</span>
                <span class="stat-value highlight">${totalInvocations}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Unique Commands</span>
                <span class="stat-value">${uniqueCommands}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">First Tracked</span>
                <span class="stat-value">${firstTracked ? formatDate(firstTracked) : 'N/A'}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Last Activity</span>
                <span class="stat-value">${lastTracked ? formatDate(lastTracked) : 'N/A'}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Avg per Command</span>
                <span class="stat-value">${uniqueCommands ? (totalInvocations / uniqueCommands).toFixed(1) : 0}</span>
            </div>
        </div>

        <div class="overview-card">
            <h3>Top 5 Commands</h3>
            ${top5.length > 0 ? top5.map((cmd, i) => `
                <div class="stat-row">
                    <span class="stat-label">${i + 1}. <span class="command-key" style="font-size: 11px; padding: 2px 6px;">${escapeHtml(cmd.key)}</span></span>
                    <span class="stat-value">${cmd.count} uses</span>
                </div>
            `).join('') : '<div class="stat-row"><span class="stat-label">No data yet</span></div>'}
        </div>

        <div class="overview-card">
            <h3>By Mode</h3>
            ${Object.keys(modeDistribution).length > 0 ? Object.entries(modeDistribution)
                .sort((a, b) => b[1] - a[1])
                .map(([mode, count]) => `
                    <div class="stat-row">
                        <span class="stat-label">${mode}</span>
                        <span class="stat-value">${count} (${((count / totalInvocations) * 100).toFixed(1)}%)</span>
                    </div>
                `).join('') : '<div class="stat-row"><span class="stat-label">No data yet</span></div>'}
        </div>
    `;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Format date for display
function formatDate(isoString) {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;

    // Less than 1 minute
    if (diff < 60000) return 'Just now';
    // Less than 1 hour
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    // Less than 24 hours
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    // Less than 7 days
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

    return date.toLocaleDateString();
}

// Truncate URL for display
function truncateUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        return parsed.hostname + (parsed.pathname.length > 30 ? parsed.pathname.substring(0, 30) + '...' : parsed.pathname);
    } catch {
        return url.substring(0, 50);
    }
}

// Switch tabs
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.stats-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });

    // Render content
    switch (tabName) {
        case 'frequent':
            renderFrequent();
            break;
        case 'recent':
            renderRecent();
            break;
        case 'overview':
            renderOverview();
            break;
    }
}

// Refresh data
async function refresh() {
    usageData = await loadUsageData();
    updateSummary();

    // Re-render current active tab
    const activeTab = document.querySelector('.stats-tab.active');
    if (activeTab) {
        switchTab(activeTab.dataset.tab);
    }
}

// Export data as JSON
function exportData() {
    const dataStr = JSON.stringify(usageData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `surfingkeys-usage-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Clear all data
async function clearData() {
    if (!confirm('Clear all usage statistics? This cannot be undone.')) {
        return;
    }

    await new Promise((resolve) => {
        chrome.storage.local.set({
            [STORAGE_KEY]: {
                commands: {},
                recentHistory: [],
                stats: {
                    totalInvocations: 0,
                    firstTracked: null,
                    lastTracked: null
                }
            }
        }, resolve);
    });

    await refresh();
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await refresh();

    // Tab click handlers
    document.querySelectorAll('.stats-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Button handlers
    document.getElementById('btn-refresh').addEventListener('click', refresh);
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-clear').addEventListener('click', clearData);
});
