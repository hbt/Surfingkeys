import { RUNTIME } from '../runtime.js';
import { getBrowserName } from '../utils.js';
import type { CommandAPI, ClipboardManager } from '../../../../@types/surfingkeys';

export default function registerProxy(
    api: CommandAPI,
    clipboard: unknown,
    _insert: unknown,
    _normal: unknown,
    _hints: unknown,
    _visual: unknown,
    _front: unknown,
    _browser: unknown
): void {
    const cb = clipboard as ClipboardManager;
    const { mapkey, map } = api;

    if (getBrowserName() !== "Chrome") return;

    mapkey('cp', {
        short: "Toggle proxy for site",
        unique_id: "cmd_proxy_toggle_site",
        feature_group: 13,
        category: "proxy",
        description: "Toggle proxy usage for current site's hostname",
        tags: ["proxy", "network", "toggle"]
    }, function() {
        var host = window.location.host.replace(/:\d+/,'');
        if (host && host.length) {
            RUNTIME('updateProxy', {
                host: host,
                operation: "toggle"
            });
        }
    });
    mapkey(';cp', {
        short: "Copy proxy info",
        unique_id: "cmd_proxy_copy_info",
        feature_group: 13,
        category: "proxy",
        description: "Copy current proxy configuration to clipboard as JSON",
        tags: ["proxy", "network", "clipboard"]
    }, function() {
        RUNTIME('getSettings', {
            key: ['proxyMode', 'proxy', 'autoproxy_hosts']
        }, function(response) {
            cb.write(JSON.stringify((response as { settings: unknown }).settings, null, 4));
        });
    });

    // create shortcuts for the command with different parameters
    map(';pa', ':setProxyMode always', null as unknown as RegExp, {
        short: "Set proxy mode always",
        unique_id: "cmd_proxy_mode_always",
        feature_group: 13,
        category: "proxy",
        description: "Set proxy mode to always use proxy for all sites",
        tags: ["proxy", "network", "mode"]
    });
    map(';pb', ':setProxyMode byhost', null as unknown as RegExp, {
        short: "Set proxy mode byhost",
        unique_id: "cmd_proxy_mode_byhost",
        feature_group: 13,
        category: "proxy",
        description: "Set proxy mode to use proxy based on hostname rules",
        tags: ["proxy", "network", "mode"]
    });
    map(';pd', ':setProxyMode direct', null as unknown as RegExp, {
        short: "Set proxy mode direct",
        unique_id: "cmd_proxy_mode_direct",
        feature_group: 13,
        category: "proxy",
        description: "Set proxy mode to direct connection without proxy",
        tags: ["proxy", "network", "mode"]
    });
    map(';ps', ':setProxyMode system', null as unknown as RegExp, {
        short: "Set proxy mode system",
        unique_id: "cmd_proxy_mode_system",
        feature_group: 13,
        category: "proxy",
        description: "Set proxy mode to use system proxy settings",
        tags: ["proxy", "network", "mode"]
    });
    map(';pc', ':setProxyMode clear', null as unknown as RegExp, {
        short: "Set proxy mode clear",
        unique_id: "cmd_proxy_mode_clear",
        feature_group: 13,
        category: "proxy",
        description: "Clear proxy configuration and disable proxy",
        tags: ["proxy", "network", "mode"]
    });
}
