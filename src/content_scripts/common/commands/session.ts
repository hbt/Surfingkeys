import { RUNTIME } from '../runtime.js';
import type { CommandAPI } from '../../../../@types/surfingkeys';

export default function registerSession(
    api: CommandAPI,
    _clipboard: unknown,
    _insert: unknown,
    _normal: unknown,
    _hints: unknown,
    _visual: unknown,
    _front: unknown,
    _browser: unknown
): void {
    const { mapkey } = api;

    mapkey('ZZ', {
        short: "Save session and quit",
        unique_id: "cmd_session_save_quit",
        feature_group: 5,
        category: "session",
        description: "Save current session and close all tabs",
        tags: ["session", "save", "quit"]
    }, function() {
        RUNTIME('createSession', {
            name: 'LAST',
            quitAfterSaved: true
        });
    });
    mapkey('ZR', {
        short: "Restore last session",
        unique_id: "cmd_session_restore",
        feature_group: 5,
        category: "session",
        description: "Restore previously saved session",
        tags: ["session", "restore", "open"]
    }, function() {
        RUNTIME('openSession', {
            name: 'LAST'
        });
    });
}
