import registerHelp from './commands/help.js';
import registerNavigation from './commands/navigation.js';
import registerHints from './commands/hints.js';
import registerClipboard from './commands/clipboard.js';
import registerVisual from './commands/visual.js';
import registerOmnibar from './commands/omnibar.js';
import registerMarks from './commands/marks.js';
import registerInsert from './commands/insert.js';
import registerSession from './commands/session.js';
import registerFrames from './commands/frames.js';
import registerTabs from './commands/tabs.js';
import registerSettings from './commands/settings.js';
import registerChrome from './commands/chrome.js';
import registerProxy from './commands/proxy.js';
import registerMisc from './commands/misc.js';
import type { CommandAPI } from '../../../@types/surfingkeys';

export default function(api: unknown, clipboard: unknown, insert: unknown, normal: unknown, hints: unknown, visual: unknown, front: unknown, browser?: unknown): void {
    const _api = api as CommandAPI;
    registerHelp(_api, clipboard, insert, normal, hints, visual, front, browser);
    registerNavigation(_api, clipboard, insert, normal, hints, visual, front, browser);
    registerHints(_api, clipboard, insert, normal, hints, visual, front, browser);
    registerClipboard(_api, clipboard, insert, normal, hints, visual, front, browser);
    registerVisual(_api, clipboard, insert, normal, hints, visual, front, browser);
    registerOmnibar(_api, clipboard, insert, normal, hints, visual, front, browser);
    registerMarks(_api, clipboard, insert, normal, hints, visual, front, browser);
    registerInsert(_api, clipboard, insert, normal, hints, visual, front, browser);
    registerSession(_api, clipboard, insert, normal, hints, visual, front, browser);
    registerFrames(_api, clipboard, insert, normal, hints, visual, front, browser);
    registerTabs(_api, clipboard, insert, normal, hints, visual, front, browser);
    registerSettings(_api, clipboard, insert, normal, hints, visual, front, browser);
    registerChrome(_api, clipboard, insert, normal, hints, visual, front, browser);
    registerProxy(_api, clipboard, insert, normal, hints, visual, front, browser);
    registerMisc(_api, clipboard, insert, normal, hints, visual, front, browser);
}
