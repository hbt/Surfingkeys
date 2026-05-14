import type { CommandAPI } from '../../../../@types/surfingkeys';

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
}
