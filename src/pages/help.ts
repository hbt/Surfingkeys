export {};

interface HelpEntry { key: string; unique_id: string; description: string; }

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['sk_help_commands'], (result) => {
        const commands: HelpEntry[] = result['sk_help_commands'] || [];
        const tbody = document.getElementById('sk_help_tbody')!;
        commands.forEach(({ key, unique_id, description }) => {
            const tr = document.createElement('tr');
            const tdKey = document.createElement('td');
            const hasMapping = key && !/^g-\d{3}$/.test(key);
            tdKey.textContent = hasMapping ? key : 'N/A';
            tdKey.className = hasMapping ? 'col-key' : 'col-key col-key-na';
            const tdId = document.createElement('td');
            tdId.textContent = unique_id;
            const tdDesc = document.createElement('td');
            tdDesc.textContent = description;
            tr.appendChild(tdKey);
            tr.appendChild(tdId);
            tr.appendChild(tdDesc);
            tbody.appendChild(tr);
        });
    });
});
