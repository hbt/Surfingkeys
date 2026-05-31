import type { CommandAPI } from '../../../../@types/surfingkeys';
import { tabOpenLink } from '../utils.js';
import type { GKey } from '../g-keys.js';

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
            return {
                unique_id: id,
                description: cmd?.annotation?.description || cmd?.annotation?.short || ''
            };
        });
        chrome.storage.local.set({ sk_help_commands: commands }, () => {
            tabOpenLink("/pages/help.html");
        });
    });
}
