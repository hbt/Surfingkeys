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

export default function(api: unknown, clipboard: unknown, insert: unknown, normal: unknown, hints: unknown, visual: unknown, front: unknown, browser: unknown): void {
    registerHelp(api as any, clipboard, insert, normal, hints, visual, front, browser);
    registerNavigation(api as any, clipboard, insert, normal, hints, visual, front, browser);
    registerHints(api as any, clipboard, insert, normal, hints, visual, front, browser);
    registerClipboard(api as any, clipboard, insert, normal, hints, visual, front, browser);
    registerVisual(api as any, clipboard, insert, normal, hints, visual, front, browser);
    registerOmnibar(api as any, clipboard, insert, normal, hints, visual, front, browser);
    registerMarks(api as any, clipboard, insert, normal, hints, visual, front, browser);
    registerInsert(api as any, clipboard, insert, normal, hints, visual, front, browser);
    registerSession(api as any, clipboard, insert, normal, hints, visual, front, browser);
    registerFrames(api as any, clipboard, insert, normal, hints, visual, front, browser);
    registerTabs(api as any, clipboard, insert, normal, hints, visual, front, browser);
    registerSettings(api as any, clipboard, insert, normal, hints, visual, front, browser);
    registerChrome(api as any, clipboard, insert, normal, hints, visual, front, browser);
    registerProxy(api as any, clipboard, insert, normal, hints, visual, front, browser);
    registerMisc(api as any, clipboard, insert, normal, hints, visual, front, browser);
}
