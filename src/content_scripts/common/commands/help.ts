import type { CommandAPI } from '../../../../@types/surfingkeys';
import { tabOpenLink } from '../utils.js';
import type { GKey } from '../g-keys.js';
import KeyboardUtils from '../keyboardUtils.js';

function decodeAnnotation(ann: any): string {
    if (!ann) return '';
    if (typeof ann === 'string') return ann;
    if (Array.isArray(ann)) {
        const tpl = String(ann[0]).replace(/^#\d+/, '');
        return tpl.replace('{0}', ann[1] ?? '');
    }
    return ann.short || ann.description || '';
}

export default function registerHelp(
    api: CommandAPI,
    _clipboard: unknown,
    _insert: unknown,
    _normal: unknown,
    _hints: unknown,
    _visual: unknown,
    front: unknown,
    _browser: unknown
): void {
    const { mapkey } = api;

    mapkey('?', {
        short: "Show usage",
        unique_id: "cmd_show_usage",
        feature_group: 0,
        category: "help",
        description: "Display help showing all available keyboard shortcuts",
        tags: ["help", "usage", "keyboard"]
    }, function() {
        (front as any).showUsage();
    });

    mapkey("g-019" satisfies GKey, {
        short: "Show command reference",
        unique_id: "cmd_show_help",
        feature_group: 0,
        category: "help",
        description: "Open command reference page listing all commands with their IDs and descriptions",
        tags: ["help", "commands", "reference"]
    }, function() {
        const commands = (api as any).listCommands().map((id: string) => {
            const cmd = (api as any).getCommand(id);
            const liveMapped = (api as any).isLiveMapped(id);
            return {
                key: liveMapped ? (cmd?.originalKey || '') : '',
                unique_id: id,
                mode: cmd?.mode || 'Normal',
                category: cmd?.annotation?.category || '',
                description: cmd?.annotation?.description || cmd?.annotation?.short || ''
            };
        });

        // Merge implicit commands (no unique_id) from mode tries into main commands list
        const modeObjs = [
            { name: 'Normal',  obj: _normal  as any },
            { name: 'Insert',  obj: _insert  as any },
            { name: 'Visual',  obj: _visual  as any },
            { name: 'Hints',   obj: _hints   as any },
        ];
        for (const { name, obj } of modeObjs) {
            if (!obj?.mappings) continue;
            const metas = obj.mappings.getMetas(() => true);
            for (const meta of metas) {
                const ann = meta.annotation;
                if (typeof ann === 'object' && ann !== null && !Array.isArray(ann) && ann.unique_id) continue;
                const desc = decodeAnnotation(ann);
                if (desc.startsWith('[UNKNOWN:')) continue;
                commands.push({
                    key: KeyboardUtils.decodeKeystroke(meta.word),
                    unique_id: '',
                    mode: name,
                    category: name === 'Visual' ? 'search' : 'shortcuts',
                    description: desc,
                });
            }
        }

        chrome.storage.local.set({ sk_help_commands: commands }, () => {
            tabOpenLink("/pages/help.html");
        });
    });
}
