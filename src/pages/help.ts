export {};

interface HelpEntry { unique_id: string; description: string; }

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['sk_help_commands'], (result) => {
        const commands: HelpEntry[] = result['sk_help_commands'] || [];
        const tbody = document.getElementById('sk_help_tbody')!;
        commands.forEach(({ unique_id, description }) => {
            const tr = document.createElement('tr');
            const tdId = document.createElement('td');
            tdId.textContent = unique_id;
            const tdDesc = document.createElement('td');
            tdDesc.textContent = description;
            tr.appendChild(tdId);
            tr.appendChild(tdDesc);
            tbody.appendChild(tr);
        });
    });
});
