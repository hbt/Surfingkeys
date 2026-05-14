import { encode } from 'js-base64';
import {
    attachFaviconToImgSrc,
    createElementWithContent,
    generateQuickGuid,
    getAnnotations,
    getBrowserName,
    getWordUnderCursor,
    htmlEncode,
    initL10n,
    initSKFunctionListener,
    refreshHints,
    rotateInput,
    setSanitizedContent,
    mapInMode
} from '../common/utils.js';
import { RUNTIME, runtime } from '../common/runtime.js';
import KeyboardUtils from '../common/keyboardUtils';
import Mode from '../common/mode';
import { getAnnotationString } from '../../common/commandMetadata.js';
import createClipboard from '../common/clipboard.js';
import createInsert from '../common/insert.js';
import createNormal from '../common/normal.js';
import createVisual from '../common/visual.js';
import createHints from '../common/hints.js';
import createAPI from '../common/api.js';
import createDefaultMappings from '../common/default.js';
import createOmnibar from './omnibar.js';
import createCommands from './command.js';
import { setupHelpFilter } from './fuzzyFilter.js';
import { ModeConstructor, SKKeyboardEvent } from '../../../@types/surfingkeys';

// ace is loaded dynamically via import() — minimal interface for the methods we call
declare const ace: {
    edit(el: string | HTMLElement): AceEditor;
    config: {
        loadModule(name: string, cb: (mod: AceModule) => void): void;
    };
};
interface AceEditor {
    getValue(): string;
    setValue(val: string, cursorPos?: number): void;
    setOptions(opts: Record<string, unknown>): void;
    setOption(key: string, val: unknown): void;
    setFontSize(size: number): void;
    setTheme(theme: string): void;
    setKeyboardHandler(handler: string, cb?: () => void): void;
    setReadOnly(flag: boolean): void;
    getKeyboardHandler(): { defaultKeymap: unknown[] };
    session: { getLine(row: number): string };
    selection: { lead: { row: number } };
    container: HTMLElement & { style: CSSStyleDeclaration };
    state: { cm: AceCM };
    completer?: { activated: boolean };
    language_tools?: { setCompleters(completers: unknown[]): void };
    renderer: { session: { $undoManager: { reset(): void } }; scrollCursorIntoView(): void };
    $blockScrolling: unknown;
    $emacsModeHandler: { addCommands(cmds: Record<string, unknown>): void; bindKey(key: string, cmd: string): void };
}
interface AceCM {
    mode: string;
    state: { vim: { status: unknown } };
    openDialog(template: string, cb: (val: string) => void, opts: Record<string, unknown>): void;
    on(event: string, cb: (data: unknown) => void): void;
    off(event: string, cb: (data: unknown) => void): void;
    signal(event: string, val: unknown): void;
    setCursor(line: number, col: number): void;
    ace: AceEditor;
    constructor: { Vim: AceVim };
}
interface AceVim {
    defineEx(name: string, abbrev: string, fn: (cm: unknown, input: unknown) => void): void;
    map(lhs: string, rhs: string, ctx?: string): void;
    unmap(key: string, ctx?: string): void;
    exitInsertMode(cm: AceCM): void;
    $id?: string;
    apply(vim: AceVim, args: unknown[]): void;
}
interface AceModule { [key: string]: unknown; Autocomplete?: { startCommand: { bindKey: string }; prototype: { commands: Record<string, unknown> } }; FilteredList?: { prototype: { filterCompletions: unknown } } }
interface NvimClient {
    on(event: string, cb: (data: unknown) => void): void;
    off(event: string, cb: (data: unknown) => void): void;
    connect(url: string, cb: () => void): void;
    command(cmd: string): void;
}

const Front = (function() {
    const clipboard = createClipboard();
    Mode.init();
    const insert = createInsert();
    const normal = createNormal(insert);
    normal.enter();
    const hints = createHints(insert, normal, clipboard);
    const visual = createVisual(clipboard, hints);

    type FrontSelf = InstanceType<ModeConstructor> & {
        _actions: Record<string, (message: Record<string, unknown>) => unknown>;
        topOrigin: string;
        topSize: number[];
        statusBar: Element | null;
        vimMappings: unknown[][];
        vimKeyMap: unknown[] | undefined;
        onEditorSaved?: ((data: string) => void) | undefined;
        hidePopup(): void;
        flush(): void;
        startInputGuard(): void;
        visualCommand(args: Record<string, unknown>): void;
        contentCommand(args: Record<string, unknown>, successById?: (result: unknown) => boolean | void): void;
        postMessage(args: Record<string, unknown>): void;
        openOmnibar(args: Record<string, unknown>): void;
        showEditor(message: Record<string, unknown>): void;
        addDestroyListener(task: () => void): void;
        toggleStatus(visible: boolean): void;
        chooseTab(): void;
        showUsage(): void;
        [key: string]: unknown;
    };
    const self = new (Mode as unknown as ModeConstructor)("Front") as FrontSelf;
    self._actions = {};
    self.topSize = [0, 0];
    let destroyListeners: (() => void)[] = [];
    self.addDestroyListener = (task: () => void) => {
        destroyListeners.push(task);
    };
    const omnibar = createOmnibar(self as unknown as Parameters<typeof createOmnibar>[0], clipboard);

    createCommands(normal, omnibar.command, omnibar);

    const modes = {
        Insert: insert,
        Normal: normal,
        Visual: visual,
        Omnibar: omnibar,
    };

    const api = createAPI(clipboard, insert, normal, hints, visual, self as unknown as Parameters<typeof createAPI>[5], {});
    createDefaultMappings(api, clipboard, insert, normal, hints, visual, self);

    var _actions = self._actions,
        _callbacks: Record<string, (message: Record<string, unknown>) => boolean | void> = {};
    self.contentCommand = function(args: Record<string, unknown>, successById?: (result: unknown) => boolean | void) {
        args.toContent = true;
        args.id = generateQuickGuid();
        if (successById) {
            args.ack = true;
            _callbacks[args.id as string] = successById;
        }
        top!.postMessage({surfingkeys_uihost_data: args}, self.topOrigin);
    };

    self.postMessage = function(args: Record<string, unknown>) {
        top!.postMessage({surfingkeys_uihost_data: args}, self.topOrigin);
    };

    var pressedHintKeys = "";
    type DisplayElement = Element & { style: CSSStyleDeclaration; onHide?(): void; onHit?(matched: unknown): void; noPointerEvents?: boolean };
    var _display: DisplayElement | null = null;
    self.addEventListener('keydown', function(event: SKKeyboardEvent) {
        if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)) {
            self.hidePopup();
            event.sk_stopPropagation = true;
        } else if (_display && _display.style.display !== "none") {
            const tabHints = Array.from(_display.querySelectorAll('div>div.sk_tab_hint'));
            if (tabHints.length > 0) {
                const key = event.sk_keyName;
                const characters = hints.getCharacters().toLowerCase();
                if (event.keyCode === KeyboardUtils.keyCodes.backspace) {
                    if (pressedHintKeys.length > 0) {
                        pressedHintKeys = pressedHintKeys.substr(0, pressedHintKeys.length - 1);
                        refreshHints(tabHints, pressedHintKeys);
                    }
                } else if (characters.indexOf(key.toLowerCase()) !== -1) {
                    pressedHintKeys = pressedHintKeys + key.toUpperCase();
                    const hintState = refreshHints(tabHints, pressedHintKeys);
                    if (hintState.matched) {
                        _display.onHit?.(hintState.matched);
                        pressedHintKeys = "";
                        self.hidePopup();
                    } else if (hintState.candidates === 0) {
                        pressedHintKeys = "";
                        self.hidePopup();
                    }
                } else {
                    showElement(_omnibar, () => {
                        _omnibar.onShow({type: 'Tabs'});
                    });
                }

                event.sk_stopPropagation = true;
            }
        }
    });

    interface FrontState { enter(): void; nextState(): void; }
    var _state: FrontState;
    function State(this: FrontState, pointerEvents: string, frameHeight: string, onEnter?: () => void) {
        this.enter = function() {
            if (onEnter) {
                onEnter();
            }
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            _state = this;
            top!.postMessage({surfingkeys_uihost_data: {
                action: 'setFrontFrame',
                pointerEvents: pointerEvents,
                frameHeight: frameHeight
            }}, self.topOrigin as string);
        };
        this.nextState = function () {
            var visibleDivs = Array.from(document.body.querySelectorAll("body>div")).filter(function(n: Element) {
                return (n as HTMLElement).style.display !== "none";
            });
            var ptrEvents = visibleDivs.map(function(d: Element) {
                var id = d.id;
                var divNoPointerEvents = ["sk_keystroke", "sk_banner"];
                if (divNoPointerEvents.indexOf(id) !== -1) {
                    // no pointerEvents for bubble
                    return false;
                } else if (id === "sk_status") {
                    // only pointerEvents when input in statusBar
                    return (self.statusBar as Element).querySelector('input') !== null;
                } else {
                    // with pointerEvents for all other DIVs except that noPointerEvents is set.
                    return !(d as Element & Record<string, unknown>).noPointerEvents;
                }
            });
            // to make pointerEvents not empty
            ptrEvents.push(false);
            const pointerEventsAny = ptrEvents.reduce(function(a, b) {
                return a || b;
            });

            var ns;
            if (pointerEventsAny) {
                ns = stateInteractive;
            } else if (visibleDivs.length > 0) {
                ns = stateVisible;
            } else {
                ns = stateInvisible;
            }
            if (_state !== ns) {
                ns.enter();
            }
        };
    }
    const stateInvisible = new (State as unknown as new (pe: string, fh: string, oe?: () => void) => FrontState)("none", "0px");
    const stateVisible = new (State as unknown as new (pe: string, fh: string, oe?: () => void) => FrontState)("none", "100%");
    const stateInteractive = new (State as unknown as new (pe: string, fh: string, oe?: () => void) => FrontState)("all", "100%", function() {
        window.focus();
    });
    _state = stateInvisible;

    self.flush = function() {
        _state.nextState();
    };
    self.visualCommand = function(args: Record<string, unknown>) {
        if (_usage.style.display !== "none") {
            // visual mode in frontend.html, such as help
            (visual[args.action as string] as (query: unknown) => void)(args.query);
        } else {
            // visual mode for all content windows
            self.contentCommand(args);
        }
    };

    const _omnibar = document.getElementById('sk_omnibar') as HTMLElement & { onShow(args: Record<string, unknown>): void; onHide(): void; style: CSSStyleDeclaration };
    self.statusBar = document.getElementById('sk_status');
    const _usage = document.getElementById('sk_usage')!;
    const _popup = document.getElementById('sk_popup')!;
    const _editor = document.getElementById('sk_editor')!;
    const _nvim = document.getElementById('sk_nvim')!;
    const _tabs = document.getElementById('sk_tabs')!;
    const _banner = document.getElementById('sk_banner')!;
    type BubbleEl = HTMLElement & { noPointerEvents?: boolean };
    const _bubble = document.getElementById('sk_bubble') as BubbleEl;
    const sk_bubble_content = _bubble.querySelector("div.sk_bubble_content") as HTMLElement;
    const sk_bubble_arrow = _bubble.querySelector('div.sk_arrow') as HTMLElement;
    const sk_bubbleClassList = sk_bubble_content.classList;
    function clearScrollerIndicator() {
        sk_bubbleClassList.remove("sk_scroller_indicator_top");
        sk_bubbleClassList.remove("sk_scroller_indicator_middle");
        sk_bubbleClassList.remove("sk_scroller_indicator_bottom");
    }
    sk_bubble_content.onscroll = (_evt: Event) => {
        clearScrollerIndicator();
        if (sk_bubble_content.scrollTop === 0) {
            sk_bubbleClassList.add("sk_scroller_indicator_top");
        } else if (sk_bubble_content.scrollTop + sk_bubble_content.offsetHeight >= sk_bubble_content.scrollHeight) {
            sk_bubbleClassList.add("sk_scroller_indicator_bottom");
        } else {
            sk_bubbleClassList.add("sk_scroller_indicator_middle");
        }
    };
    var keystroke = document.getElementById('sk_keystroke')!;

    self.startInputGuard = () => {
        if (getBrowserName().startsWith("Safari")) {
            var inputGuard = setInterval(() => {
                let input: HTMLInputElement | HTMLTextAreaElement | null = null;
                for (const a of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")) {
                    if (a.getBoundingClientRect().width) {
                        input = a;
                        break;
                    }
                }
                if (input && document.activeElement !== input) {
                    input.focus();
                    input.value = " ";
                    setTimeout(() => {
                        input!.value = "";
                    }, 10);
                } else {
                    clearInterval(inputGuard);
                }
            }, 100);
        }
    };
    _actions['hidePopup'] = function() {
        if (_display && _display.style.display !== "none") {
            _display.style.display = "none";
            self.flush();
            if (_display.onHide) {
                _display.onHide();
            }
            self.exit();
        }
    };
    self.hidePopup = _actions['hidePopup'] as unknown as () => void;

    function setDisplay(td: DisplayElement, render?: () => void) {
        if (_display && _display.style.display !== "none") {
            _display.style.display = "none";
            if (_display.onHide) {
                _display.onHide();
            }
        }
        _display = td;
        _display.style.display = "";
        if (render) {
            render();
        }
        (self.startInputGuard as () => void)();
    }

    function showElement(td: DisplayElement, render?: () => void, onHit?: (matched: unknown) => void) {
        (self.enter as (delay: number, flag: boolean) => void)(0, true);
        td.onHit = onHit;
        setDisplay(td, render);
        (self.flush as () => void)();
    }

    type TabInfo = { id: number; windowId: number; title: string; active: boolean; url: string; favIconUrl: string };
    function renderTabTitles(container: Element, tabs: TabInfo[]) {
        tabs.forEach(function(t: TabInfo, _i: number) {
            const tab = createElementWithContent('div', `<div class=sk_tab_wrap><div class=sk_tab_icon><img/></div><div class=sk_tab_title>${htmlEncode(t.title)}</div></div>`, { "class": 'sk_tab' });
            if (t.active) {
                tab.classList.add("active");
            }
            attachFaviconToImgSrc(t, tab.querySelector("img")!);
            container.append(tab);
        });
    }
    function renderTabs(container: HTMLElement, tabs: TabInfo[]) {
        setSanitizedContent(container, "");
        var hintLabels = hints.genLabels(tabs.length - 1);
        const unitWidth = (window.innerWidth - 2) / tabs.length - 2;
        const verticalTabs = runtime.conf.verticalTabs;
        container.className = verticalTabs ? "vertical" : "horizontal";
        renderTabTitles(container, tabs);
        if (verticalTabs) {
            container.querySelectorAll("div.sk_tab").forEach((tab: Element) => {
                tab.append(createElementWithContent('div', '🚀', {class: "tab_rocket"}));
            });
        } else {
            container.querySelectorAll("div.sk_tab").forEach((tab: Element) => {
                (tab.querySelector("div.sk_tab_title") as HTMLElement).style.width = (unitWidth - 24) + 'px';
                (tab as HTMLElement).style.width = unitWidth + 'px';
            });
        }
        const tabsNeedHint = tabs.filter((t: TabInfo) => !t.active);
        container.querySelectorAll("div.sk_tab:not(.active)").forEach((tab: Element, i: number) => {
            const tabHint = createElementWithContent('div', hintLabels[i], { "class": 'sk_tab_hint' }) as unknown as Element & Record<string, unknown>;
            const tabData = tabsNeedHint[i];
            tabHint.label = hintLabels[i];
            tabHint.link = {id: tabData.id, windowId: tabData.windowId};
            tab.prepend(tabHint);
        });
        if (container.getBoundingClientRect().height > (self.topSize as number[])[1]) {
            container.className = "inline";
        }
    }
    _actions['chooseTab'] = function() {
        const tabsThreshold = Math.min(runtime.conf.tabsThreshold, Math.ceil(window.innerWidth / 26));
        RUNTIME('getTabs', {queryInfo: {currentWindow: true}, tabsThreshold}, function(response) {
            const tabs = response.tabs as unknown[];
            if (tabs.length > tabsThreshold) {
                showElement(_omnibar, () => {
                    _omnibar.onShow({type: 'Tabs'});
                });
            } else if (tabs.length > 0) {
                showElement(_tabs as unknown as DisplayElement, () => {
                    renderTabs(_tabs, tabs as TabInfo[]);
                }, (matched: unknown) => {
                    const m = matched as { windowId: number; id: number };
                    RUNTIME('focusTab', {
                        windowId: m.windowId,
                        tabId: m.id
                    });
                });
            }
        });
    };
    self.chooseTab = _actions['chooseTab'] as unknown as () => void;
    _actions['groupTab'] = function() {
        RUNTIME('getTabGroups', {}, function(response) {
            type TabGroup = { id: string; active: boolean; collapsed: boolean; title: string; tabs: unknown[] };
            const groups = response.groups as TabGroup[];
            if (groups.length === 0) {
                self.openOmnibar({type: "Commands", pref: "createTabGroup"});
                return;
            }

            showElement(_tabs as unknown as DisplayElement, () => {
                setSanitizedContent(_tabs, "");
                _tabs.className = "";
                const hintLabels = hints.genLabels(groups.length*2 + 1);
                groups.forEach(function(g: TabGroup, i: number) {
                    const group = document.createElement('div');
                    group.setAttribute('class', 'sk_tab_group');
                    const labels = [hintLabels[2*i],hintLabels[2*i + 1]];
                    setSanitizedContent(group, `<div class=sk_tab_group_header><div><div class=sk_tab_hint>${labels[0]}</div><span class=sk_tab_group_title></span></div><div><div class=sk_tab_hint>${labels[1]}</div><span class=sk_tab_group_state></span></div></div><div class=sk_tab_group_details></div>`);
                    renderTabTitles(group.querySelector("div.sk_tab_group_details") as Element, g.tabs as TabInfo[]);
                    const activeState = g.active ? '☑' : '☐';
                    setSanitizedContent(group.querySelector("span.sk_tab_group_title"), activeState + htmlEncode(g.title));
                    const collapsedState = g.collapsed ? '☑' : '☐';
                    setSanitizedContent(group.querySelector("span.sk_tab_group_state"), collapsedState + "Collapsed");
                    const tabHints = group.querySelectorAll("div.sk_tab_hint");
                    (tabHints[0] as Element & Record<string, unknown>).label = labels[0];
                    (tabHints[0] as Element & Record<string, unknown>).link = {id: g.id, active: g.active, action: "group"};
                    (tabHints[1] as Element & Record<string, unknown>).label = labels[1];
                    (tabHints[1] as Element & Record<string, unknown>).link = {id: g.id, collapsed: g.collapsed, action: "collapse"};
                    _tabs.append(group);
                });
                const newTabGroup = createElementWithContent('div', `<div class=sk_tab_hint>${hintLabels[groups.length*2]}</div> New tab group`, { "class": 'sk_tab_group' });
                const tabHint = newTabGroup.querySelector("div.sk_tab_hint") as (Element & Record<string, unknown>) | null;
                if (tabHint) {
                    tabHint.label = hintLabels[groups.length*2];
                    tabHint.link = {action: "new"};
                }
                _tabs.append(newTabGroup);
            }, (matched: unknown) => {
                const m = matched as { action: string; id: string; active: boolean; collapsed: boolean };
                if (m.action === "collapse") {
                    RUNTIME('collapseGroup', {groupId: m.id, collapsed: !m.collapsed});
                } else if (m.action === "new") {
                    setTimeout(() => {
                        (self.openOmnibar as (args: Record<string, unknown>) => void)({type: "Commands", pref: "createTabGroup"});
                    }, 10);
                } else {
                    if (m.active) {
                        RUNTIME('ungroupTab');
                    } else {
                        RUNTIME('createTabGroup', {groupId: m.id});
                    }
                }
            });
        });
    };

    function localizeAnnotation(locale: (key: string) => string, annotation: unknown) {
        if (Array.isArray(annotation)) {
            const fmt = annotation[0] as string;
            return (locale(fmt) as unknown as { format(...args: unknown[]): string }).format(...annotation.slice(1));
        } else {
            return locale(annotation as string);
        }
    }

    function buildUsage(metas: unknown[], cb: (html: string) => void) {
        var feature_groups = [
            'Help',                  // 0
            'Mouse Click',           // 1
            'Scroll Page / Element', // 2
            'Tabs',                  // 3
            'Page Navigation',       // 4
            'Sessions',              // 5
            'Search selected with',  // 6
            'Clipboard',             // 7
            'Omnibar',               // 8
            'Visual Mode',           // 9
            'vim-like marks',        // 10
            'Settings',              // 11
            'Chrome URLs',           // 12
            'Proxy',                 // 13
            'Misc',                  // 14
            'Insert Mode',           // 15
            'Lurk Mode',             // 16
            'Regional Hints Mode',   // 17
        ];

        initL10n(function(locale: (key: string) => string) {
            var help_groups: string[][] = feature_groups.map(function(){return [];});
            const lh = Mode.specialKeys["<Alt-s>"].length;
            if (lh > 0) {
                help_groups[0].push("<div><span class=kbd-span><kbd>{0}</kbd></span><span class=annotation>{1}</span></div>".format(
                    htmlEncode(Mode.specialKeys["<Alt-s>"][lh - 1]), locale("Toggle SurfingKeys on current site")));
            }

            const allMetas = metas.concat(getAnnotations(omnibar.mappings));
            allMetas.forEach(function(meta: unknown) {
                const m = meta as { feature_group: number; word: string; annotation: unknown };
                if (!help_groups[m.feature_group]) return;
                const w = KeyboardUtils.decodeKeystroke(m.word);
                const annotationStr = getAnnotationString(m.annotation);
                const annotation = localizeAnnotation(locale, annotationStr);
                const item = `<div><span class=kbd-span><kbd>${htmlEncode(w)}</kbd></span><span class=annotation>${annotation}</span></div>`;
                help_groups[m.feature_group].push(item);
            });
            const help_groups_str = help_groups.map(function(g: string[], i: number) {
                if (g.length) {
                    return "<div><div class=feature_name><span>{0}</span></div>{1}</div>".format(locale(feature_groups[i]), g.join(''));
                } else {
                    return "";
                }
            }).join("");

            const finalHtml = help_groups_str + `<p style='float:right; width:100%; text-align:right'><a href='https://github.com/brookhong/surfingkeys' target='_blank' style='color:#0095dd'>${locale("More help")}</a></p>`;
            cb(finalHtml);
        });
    }

    _actions['showUsage'] = function(message: Record<string, unknown>) {
        showElement(_usage as unknown as DisplayElement, () => {
            buildUsage(message.metas as unknown[], function(usage: string) {
                setSanitizedContent(_usage, usage);
                // Setup fuzzy filter for searching commands
                const filterAPI = setupHelpFilter(_usage);
                if (filterAPI && filterAPI.searchInput) {
                    // Focus search input after a short delay to ensure DOM is ready
                    setTimeout(() => filterAPI.searchInput.focus(), 100);
                }
            });
        });
    };
    _actions['applyUserSettings'] = function (message: Record<string, unknown>) {
        const userSettings = message.userSettings as Record<string, unknown>;
        for (var k in userSettings) {
            if (runtime.conf.hasOwnProperty(k)) {
                (runtime.conf as unknown as Record<string, unknown>)[k] = userSettings[k];
            }
        }
        if ('theme' in userSettings) {
            setSanitizedContent(document.getElementById("sk_theme"), userSettings.theme as string);
        }
    };
    _actions['setHintsCharacters'] = function (message: Record<string, unknown>) {
        hints.setCharacters(message.characters as string);
    };
    _actions['addMapkey'] = function (message: Record<string, unknown>) {
        if ((message.old_keystroke as string) in Mode.specialKeys) {
            Mode.specialKeys[message.old_keystroke as string].push(message.new_keystroke as string);
        } else if (modes.hasOwnProperty(message.mode as string)) {
            mapInMode((modes as Record<string, unknown>)[message.mode as string] as Parameters<typeof mapInMode>[0], message.new_keystroke as string, message.old_keystroke as string);
        }
    };
    _actions['addVimMap'] = function (message: Record<string, unknown>) {
        (self.vimMappings as unknown[]).push([message.lhs, message.rhs, message.ctx]);
    };
    _actions['addVimKeyMap'] = function (message: Record<string, unknown>) {
        self.vimKeyMap = message.vimKeyMap as unknown[] | undefined;
    };
    _actions['addCommand'] = function(message: Record<string, unknown>) {
        const proxyAction = (...args: unknown[]) => {
            (self.contentCommand as (args: Record<string, unknown>) => void)({
                action: 'executeUserCommand',
                name: message.name,
                args: args
            });
        };
        omnibar.command(message.name as string, message.description, proxyAction as (args: string[]) => boolean | void);
    };
    _actions['getUsage'] = function (message: Record<string, unknown>) {
        // send response in callback from buildUsage
        delete message.ack;
        buildUsage(message.metas as unknown[], function(usage: string) {
            top!.postMessage({surfingkeys_uihost_data: {
                data: usage,
                toContent: true,
                id: message.id
            }}, self.topOrigin as string);
        });
    };

    self.showUsage = self.hidePopup;

    function showPopup(content: string) {
        setSanitizedContent(_popup, content);
        showElement(_popup as unknown as DisplayElement);
    }

    _actions['showPopup'] = function(message: Record<string, unknown>) {
        showPopup(message.content as string);
    };

    function showImagePopup(dataUrl: string) {
        _popup.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px';

        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.cssText = 'max-width:100%;max-height:60vh;border-radius:3px';
        wrapper.appendChild(img);

        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:10px';

        const mkBtn = (label: string, onClick: () => void) => {
            const b = document.createElement('button');
            b.innerHTML = label;
            b.style.cssText = 'padding:6px 14px;font-size:13px;cursor:pointer;border-radius:4px;border:1px solid #555;background:#333;color:#eee';
            b.addEventListener('click', onClick);
            return b;
        };

        bar.appendChild(mkBtn('&#11015; Download', () => {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = 'screenshot-' + Date.now() + '.png';
            a.click();
        }));

        const cpBtn = mkBtn('&#128203; Copy', async () => {
            try {
                const blob = await (await fetch(dataUrl)).blob();
                await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]);
                cpBtn.innerHTML = '&#10003; Copied!';
                setTimeout(() => { cpBtn.innerHTML = '&#128203; Copy'; }, 2000);
            } catch (e) {
                cpBtn.innerHTML = '&#10007; ' + (e as Error).message.slice(0, 28);
                setTimeout(() => { cpBtn.innerHTML = '&#128203; Copy'; }, 3000);
            }
        });
        bar.appendChild(cpBtn);

        wrapper.appendChild(bar);
        _popup.appendChild(wrapper);
        showElement(_popup as unknown as DisplayElement);
    }

    _actions['showImagePopup'] = function(message: Record<string, unknown>) {
        showImagePopup(message.dataUrl as string);
    };

    _actions['showDialog'] = function(message: Record<string, unknown>) {
        showElement(_popup as unknown as DisplayElement, () => {
            const hintLabels = hints.genLabels(2);
            setSanitizedContent(_popup, `<div>${message.question}</div><div><div class=sk_tab_hint>${hintLabels[0]}</div><span class=sk_tab_group_title>Ok</span><div class=sk_tab_hint>${hintLabels[1]}</div><span class=sk_tab_group_title>Cancel</span></div>`);
            const tabHints = _popup.querySelectorAll("div.sk_tab_hint");
            _popup.style.textAlign = "center";
            (tabHints[0] as Element & Record<string, unknown>).link = "Ok";
            (tabHints[0] as Element & Record<string, unknown>).label = hintLabels[0];
            (tabHints[1] as Element & Record<string, unknown>).link = "Cancel";
            (tabHints[1] as Element & Record<string, unknown>).label = hintLabels[1];
        }, (matched: unknown) => {
            (self.contentCommand as (args: Record<string, unknown>) => void)({
                action: 'dialogResponse',
                result: matched as string
            });
        });
    };

    self.vimMappings = [];
    let _aceEditor: Promise<unknown> | null = null;
    function renderAceEditor(message: Record<string, unknown>) {
        if (!_aceEditor) {
            _aceEditor = new Promise((resolve, _reject) => {
                // @ts-expect-error -- ace.js is loaded at runtime without type declarations
                import(/* webpackIgnore: true */ './ace.js').then(() => {
                    resolve(createAceEditor(normal, self));
                });
            });
        }
        _aceEditor.then((editor: unknown) => {
            (editor as { show(msg: Record<string, unknown>): void }).show(message);
        });
    }
    let _neovim: Promise<unknown> | null = null;
    function renderNvim(message: Record<string, unknown>) {
        if (!_neovim) {
            _neovim  = new Promise((resolve, _reject) => {
                // @ts-expect-error -- neovim_lib.js is loaded at runtime without type declarations
                import(/* webpackIgnore: true */ './neovim_lib.js').then((nvimlib: unknown) => {
                    (nvimlib as { default(el: HTMLElement): Promise<{ nvim: NvimClient; destroy(): void }> }).default(_nvim).then(({nvim, destroy}) => {
                        function quitNvim() {
                            normal.enter();
                            destroy();
                            (self.hidePopup as () => void)();
                        }
                        function rpc(data: unknown) {
                            const [ event, args ] = data as [string, string[][]];
                            if (event === "WriteData") {
                                (self.contentCommand as (args: Record<string, unknown>) => void)({
                                    action: 'ace_editor_saved',
                                    data: args[0].join("\r")
                                });
                                quitNvim();
                            }
                        }
                        nvim.on('nvim:open', () => {
                            nvim.on('surfingkeys:rpc', rpc);
                        });
                        nvim.on('nvim:close', () => {
                            nvim.off('surfingkeys:rpc', rpc);
                            quitNvim();
                        });
                        resolve(nvim);
                    });
                });
            });
        }
        _neovim.then((nvim: unknown) => {
            const nvimClient = nvim as NvimClient;
            normal.exit();
            RUNTIME('connectNative', {mode: "embed"}, (resp) => {
                nvimClient.connect(resp.url as string, () => {
                    nvimClient.command(`call NewScratch("${message.file_name}", "${encode(message.content as string)}", "${message.type}")`);
                });
            });
        });
    }
    _actions['showEditor'] = function(message: Record<string, unknown>) {
        if (message.onEditorSaved) {
            self.onEditorSaved = message.onEditorSaved as (data: string) => void;
        }
        if (message.file_name) {
            showElement(_nvim as unknown as DisplayElement, () => {
                renderNvim(message);
            });
        } else {
            showElement(_editor as unknown as DisplayElement, () => {
                renderAceEditor(message);
            });
        }
    };
    self.showEditor = _actions['showEditor'];
    _actions['openOmnibar'] = function(message: Record<string, unknown>) {
        showElement(_omnibar as unknown as DisplayElement, () => {
            _omnibar.onShow(message);
            const style = (message.style as string) || "";
            setSanitizedContent(_omnibar.querySelector('style'), `#sk_omnibar {${style}}`);
        });
    };
    self.openOmnibar = _actions['openOmnibar'];
    _actions['openFinder'] = function() {
        Find.open();
    };

    function showBanner(content: string, linger_time?: number) {
        _banner.style.cssText = "";
        _banner.style.display = "";
        _banner.style.top = "0px";
        setSanitizedContent(_banner, htmlEncode(content));
        self.flush();

        let timems = linger_time || 1600;
        setTimeout(function() {
            _banner.style.cssText = "";
            _banner.style.display = "none";
            self.flush();
        }, timems);
    }
    _actions['showBanner'] = function(message: Record<string, unknown>) {
        showBanner(message.content as string, message.linger_time as number | undefined);
    };
    _actions['showBubble'] = function(message: Record<string, unknown>) {
        var pos = message.position as { left: number; top: number; winX: number; winY: number; winWidth: number; winHeight: number; width: number; height: number };
        pos.left += pos.winX;
        pos.top += pos.winY;
        // set position to (0, 0) to leave enough space for content.
        _bubble.style.top = "0px";
        _bubble.style.left = "0px";
        setSanitizedContent(sk_bubble_content, message.content as string);
        sk_bubble_content.style.maxWidth = (pos.winWidth - 32) + "px";
        sk_bubble_content.scrollTop = 0;
        clearScrollerIndicator();
        _bubble.style.display = "";
        var w = _bubble.offsetWidth,
            h = _bubble.offsetHeight;
        var left = [pos.left - 11 - w / 2, w / 2];
        if (left[0] < pos.winX) {
            left[1] += left[0] - pos.winX;
            left[0] = pos.winX;
        } else if ((left[0] + w) > pos.winWidth) {
            left[1] += left[0] - pos.winX - pos.winWidth + w;
            left[0] = pos.winX + pos.winWidth - w;
        }
        sk_bubble_arrow.style.left = (left[1] + pos.width / 2 - 2) + "px";
        _bubble.style.left = left[0] + "px";
        _bubble.noPointerEvents = message.noPointerEvents as boolean | undefined;

        if (pos.top + pos.height / 2 > pos.winHeight / 2) {
            sk_bubble_arrow.setAttribute("dir", "down");
            sk_bubble_arrow.style.top = "100%";
            sk_bubble_content.style.maxHeight = (pos.top - 12 - 32) + "px";
            h = _bubble.offsetHeight;
            _bubble.style.top = (pos.top - h - 12) + "px";
        } else {
            sk_bubble_arrow.setAttribute("dir", "up");
            sk_bubble_arrow.style.top = "-12px";
            sk_bubble_content.style.maxHeight = (pos.winHeight - (pos.top + pos.height + 12) - 32) + "px";
            h = _bubble.offsetHeight;
            _bubble.style.top = pos.top + pos.height + 12 + "px";
        }
        if (sk_bubble_content.scrollHeight > sk_bubble_content.offsetHeight) {
            _bubble.noPointerEvents = false;
            sk_bubbleClassList.add("sk_scroller_indicator_top");
        }
        self.flush();
        if (!_bubble.noPointerEvents) {
            setDisplay(_bubble as unknown as DisplayElement);
            (self.enter as (delay: number, flag: boolean) => void)(0, true);
        }
    };

    _actions['hideBubble'] = function() {
        _bubble.style.display = "none";
        (self.flush as () => void)();
    };

    _actions['visualUpdated'] = function(_message: Record<string, unknown>) {
        ((self.statusBar as Element).querySelector('input') as HTMLInputElement).focus();
    };

    _actions['showStatus'] = function(message: Record<string, unknown>) {
        StatusBar.show(message.contents as string[], message.duration as number | undefined);
    };

    initSKFunctionListener("front", {
        showPopup,
        showBanner,
        openFinder: () => {
            Find.open();
        },
        showStatus: (contents: string[], duration?: number) => {
            StatusBar.show(contents, duration);
        },
    });

    self.toggleStatus = function(visible: boolean) {
        if (visible) {
            (self.statusBar as HTMLElement).style.display = "";
        } else {
            (self.statusBar as HTMLElement).style.display = "none";
        }
    };
    _actions['toggleStatus'] = function(message: Record<string, unknown>) {
        (self.toggleStatus as (v: boolean) => void)(message.visible as boolean);
    };

    var _pendingHint: ReturnType<typeof setTimeout> | undefined;
    function clearPendingHint() {
        if (_pendingHint) {
            clearTimeout(_pendingHint);
            _pendingHint = undefined;
        }
    }

    _actions['hideKeystroke'] = function() {
        if (keystroke.style.display !== "none") {
            keystroke.classList.remove("expandRichHints");
            setSanitizedContent(keystroke, "");
            keystroke.style.display = "none";
            self.flush();
        }
        if (runtime.conf.richHintsForKeystroke > 0 && runtime.conf.richHintsForKeystroke < 10000) {
            clearPendingHint();
        }
    };

    // Color map for shortcut characters - maps each character to a unique color
    const charColorMap: Record<string, string> = {};
    const charColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B195', '#FFCCAA'];
    let colorIndex = 0;

    function getCharColor(char: string) {
        if (!charColorMap[char]) {
            charColorMap[char] = charColors[colorIndex++ % charColors.length];
        }
        return charColorMap[char];
    }

    function colorizeNextKey(nextKey: string) {
        const decodedKey = KeyboardUtils.decodeKeystroke(nextKey);
        const firstChar = htmlEncode(decodedKey[0]);

        // Check if colorful hints are enabled
        if (!runtime.conf.colorfulKeystrokeHints) {
            // Return plain text without coloring
            return `<span style="color:#fff">${htmlEncode(decodedKey)}</span>`;
        }

        const firstCharColor = getCharColor(decodedKey[0]);

        if (decodedKey.length <= 1) {
            // Single character: color and enlarge it
            return `<span style="color:${firstCharColor};font-size:1.4em;font-weight:bold">${firstChar}</span>`;
        }

        // Multi-character: color and enlarge first, make rest white (neutral)
        const restChars = htmlEncode(decodedKey.slice(1));
        return `<span style="color:${firstCharColor};font-size:1.4em;font-weight:bold">${firstChar}</span><span style="color:#fff">${restChars}</span>`;
    }

    function showRichHints(keyHints: { accumulated: string; candidates: Record<string, { annotation: unknown }> }) {
        initL10n(function (locale: (key: string) => string) {
            var words = keyHints.accumulated;
            var cc = keyHints.candidates;
            words = Object.keys(cc).sort().map(function (w) {
                const annotationStr = getAnnotationString(cc[w].annotation);
                const annotation = localizeAnnotation(locale, annotationStr);
                if (annotation) {
                    const nextKey = w.substr(keyHints.accumulated.length);
                    return `<div><span class=kbd-span><kbd>${colorizeNextKey(nextKey)}</kbd></span><span class=annotation>${annotation}</span></div>`;
                } else {
                    return "";
                }
            }).join("");
            if (words.length > 0 && _pendingHint) {
                setSanitizedContent(keystroke, words);
                keystroke.classList.add("expandRichHints");
                self.flush();
            }
        });
    }
    _actions['showKeystroke'] = function (message: Record<string, unknown>) {
        type KeyHints = { accumulated: string; candidates: Record<string, { annotation: unknown }>; key: string };
        const keyHints = message.keyHints as KeyHints;
        if (keystroke.style.display !== "none" && keystroke.classList.contains("expandRichHints")) {
            showRichHints(keyHints);
        } else {
            clearPendingHint();
            keystroke.style.display = "";
            (self.flush as () => void)();
            var keys = keystroke.innerHTML + htmlEncode(KeyboardUtils.decodeKeystroke(keyHints.key));
            setSanitizedContent(keystroke, keys);

            if (runtime.conf.richHintsForKeystroke > 0 && runtime.conf.richHintsForKeystroke < 10000) {
                _pendingHint = setTimeout(function() {
                    showRichHints(keyHints);
                }, runtime.conf.richHintsForKeystroke);
            }
        }
    };

    _actions['initFrontend'] = function(message: Record<string, unknown>) {
        self.topOrigin = message.origin as string;
        self.topSize = message.winSize as number[];
        return new Date().getTime();
    };
    _actions['destroyFrontend'] = function(_message: Record<string, unknown>) {
        if (_display && _display.style.display !== "none") {
            return false;
        }
        for (const task of destroyListeners) {
            task();
        }
        return true;
    };

    window.addEventListener('message', function(event) {
        var _message = event.data && event.data.surfingkeys_frontend_data;
        if (_message === undefined) {
            return;
        }
        const msgId = _message.id as string | undefined;
        const msgAction = _message.action as string | undefined;
        if (msgId && _callbacks[msgId]) {
            var f = _callbacks[msgId];
            // returns true to make callback stay for coming response.
            if (!f(_message)) {
                delete _callbacks[msgId];
            }
        } else if (msgAction && _actions.hasOwnProperty(msgAction)) {
            var ret = _actions[msgAction](_message);
            if (_message.ack) {
                top!.postMessage({surfingkeys_uihost_data: {
                    data: ret,
                    action: msgAction + "Ack",
                    toContent: true,
                }}, self.topOrigin as string);
            }
        }
    }, true);


    function onResize() {
        if (_bubble.style.display !== "none") {
            self.contentCommand({
                action: 'updateInlineQuery'
            });
        }
    }

    // for mouseSelectToQuery
    document.onmouseup = function(e) {
        if (!_bubble.contains(e.target as Node | null)) {
            _bubble.style.display = "none";
            self.flush();
            self.contentCommand({
                action: 'emptySelection'
            });
            window.removeEventListener("resize", onResize);
        } else {
            var sel = window.getSelection()?.toString().trim() || getWordUnderCursor(true);
            if (sel && sel.length > 0) {
                self.contentCommand({
                    action: 'updateInlineQuery',
                    word: sel
                }, function() {
                    window.addEventListener("resize", onResize);
                });
            }
        }
    };

    (_bubble.querySelector("div.sk_bubble_content") as HTMLElement).addEventListener("mousewheel", function (this: HTMLElement, evt: Event) {
        const wEvt = evt as WheelEvent;
        if (wEvt.deltaY > 0 && this.scrollTop + this.offsetHeight >= this.scrollHeight || wEvt.deltaY < 0 && this.scrollTop <= 0) {
            evt.preventDefault();
        }
    }, { passive: false });

    return self;
})();

/**
 * The status bar displays the status of Surfingkeys current mode: Normal, visual, etc.
 *
 * @kind function
 *
 * @param {Object} ui
 * @return {StatusBar} StatusBar instance
 */
var StatusBar = (function() {
    var self: { show(contents: string[], duration?: number): void } = { show: function() {} };
    var timerHide: ReturnType<typeof setTimeout> | null = null;
    var ui = Front.statusBar as Element;

    // 4 spans
    // mode: 0
    // search: 1
    // searchResult: 2
    // proxy: 3
    self.show = function(contents: string[], duration?: number) {
        if (timerHide) {
            clearTimeout(timerHide);
            timerHide = null;
        }
        var span = ui.querySelectorAll('span');
        for (var i = 0; i < contents.length; i++) {
            if (contents[i] !== undefined) {
                setSanitizedContent(span[i], contents[i]);
            }
        }
        var lastSpan = -1;
        for (var i = 0; i < span.length; i++) {
            if (span[i].innerHTML.length) {
                lastSpan = i;
                span[i].style.padding = "0px 8px";
                span[i].style.borderRight = "1px solid #999";
            } else {
                span[i].style.padding = "";
                span[i].style.borderRight = "";
            }
        }
        if (lastSpan === -1) {
            ui.style.display = 'none';
        } else {
            span[lastSpan].style.borderRight = "";
            ui.style.display = 'block';
        }
        Front.flush();
        if (duration) {
            timerHide = setTimeout(function() {
                self.show(["", "", "", ""]);
            }, duration);
        }
    };
    return self;
})();

type FindMode = InstanceType<ModeConstructor> & Record<string, unknown> & { open(): void };
var Find = (function() {
    var self = new (Mode as unknown as ModeConstructor)("Find", "/") as FindMode;

    self.addEventListener('keydown', function(event: SKKeyboardEvent) {
        // prevent this event to be handled by Surfingkeys' other listeners
        event.sk_suppressed = true;
    }).addEventListener('mousedown', function(event: SKKeyboardEvent) {
        if ((event as unknown as MouseEvent).target !== input) {
            // user clicks on somewhere else
            reset();
        }
        event.sk_suppressed = true;
    });

    let input: HTMLInputElement | null;
    let historyInc = 0;
    let userInput = "";
    function reset() {
        input = null;
        StatusBar.show(["", ""]);
        self.exit();
    }

    /**
     * Opens the status bar
     *
     * @memberof StatusBar
     * @instance
     *
     * @return {undefined}
     */
    self.open = function() {
        StatusBar.show(["/", '<input id="sk_find" class="sk_theme"/>']);
        input = (Front.statusBar as Element).querySelector("input");
        if (!getBrowserName().startsWith("Safari")) {
            input!.oninput = function() {
                if (input!.value.length && input!.value !== ".") {
                    (Front.visualCommand as (args: Record<string, unknown>) => void)({
                        action: 'visualUpdate',
                        query: input!.value
                    });
                    // To find in usage popup will set focus and selection elsewhere
                    // we need bring it back
                    input!.focus();
                    input!.setSelectionRange(input!.value.length, input!.value.length);
                }
            };
        }
        var findHistory: string[] = [];
        RUNTIME('getSettings', {
            key: 'findHistory'
        }, function(response) {
            userInput = "";
            const settings = response.settings as { findHistory: string[] };
            findHistory = settings.findHistory;
            historyInc = findHistory.length;
        });
        input!.onkeydown = function(event: KeyboardEvent & Partial<SKKeyboardEvent>) {
            if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName ?? "")) {
                reset();
                (Front.visualCommand as (args: Record<string, unknown>) => void)({
                    action: 'visualClear'
                });
            } else if (event.keyCode === KeyboardUtils.keyCodes.enter) {
                var query = input!.value;
                if (query.length && query !== ".") {
                    if (event.ctrlKey) {
                        query = '\\b' + query + '\\b';
                    }
                    reset();
                    RUNTIME('updateInputHistory', { find: query });
                    (Front.visualCommand as (args: Record<string, unknown>) => void)({
                        action: 'visualEnter',
                        query: query
                    });
                }
            } else if (event.keyCode === KeyboardUtils.keyCodes.upArrow || event.keyCode === KeyboardUtils.keyCodes.downArrow) {
                if (findHistory.length) {
                    [input!.value, historyInc] = rotateInput(findHistory, (event.keyCode === KeyboardUtils.keyCodes.downArrow), historyInc, userInput);
                    (Front.visualCommand as (args: Record<string, unknown>) => void)({
                        action: 'visualUpdate',
                        query: input!.value
                    });
                    event.preventDefault();
                }
            } else {
                userInput = input!.value;
                historyInc = findHistory.length;
            }
        };
        input!.focus();
        (Front.startInputGuard as () => void)();
        self.enter();
    };
    return self;
})();

interface AceEditorFront {
    hidePopup(): void;
    contentCommand(args: Record<string, unknown>): void;
    onEditorSaved?: (data: string) => void;
    vimMappings: unknown[][];
    vimKeyMap?: unknown[];
    [key: string]: unknown;
}
function createAceEditor(normal: { enter(): void; exit(): void; passThrough(): { exit(): void } }, front: AceEditorFront) {
    var self = new (Mode as unknown as ModeConstructor)("AceEditor") as InstanceType<ModeConstructor> & Record<string, unknown>;
    document.getElementById("sk_editor")!.style.height = "30%";
    var _ace = ace.edit('sk_editor');

    var originValue: string;
    function isDirty() {
        return _ace.getValue() != originValue;
    }

    var dialog = (function() {
        return {
            open: function(template: string, onEnter: (val: string) => void, options: Record<string, unknown>) {
                const passThrough = normal.passThrough();
                var _onClose = options.onClose as (() => void) | undefined;
                options.onClose = function() {
                    passThrough.exit();
                    if (_onClose) {
                        _onClose();
                    }
                };
                _ace.state.cm.openDialog(template, function(q: string) {
                    onEnter(q);
                    (options.onClose as () => void)();
                }, options);
            }
        };
    })();

    function _close() {
        (document.activeElement as HTMLElement).blur();
        front.hidePopup();
    }

    function _save() {
        var data = _getValue();
        if (front.onEditorSaved) {
            front.onEditorSaved(data);
            front.onEditorSaved = undefined;
        } else {
            front.contentCommand({
                action: 'ace_editor_saved',
                data: data
            });
        }
    }

    function _closeAndSave() {
        _close();
        _save();
    }

    self.addEventListener('keydown', function(event: SKKeyboardEvent) {
        event.sk_suppressed = true;
        if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)
            && (!_ace.completer || !_ace.completer.activated) // and completion popup not opened
        ) {
            if (runtime.conf.aceKeybindings === "emacs") {
                self.onExit = _close;
                self.exit();
            } else if (_ace.state.cm.mode === 'normal' // vim in normal mode
                && !_ace.state.cm.state.vim.status // and no pending normal operation
            ){
                if (isDirty()) {
                    dialog.open('<span style="font-family: monospace">Quit anyway? Y/n </span><input type="text"/>', function(q: string) {
                        if (q.toLowerCase() === 'y') {
                            self.onExit = _close;
                            self.exit();
                        }
                    }, {
                        bottom: true,
                        value: "Y",
                        onKeyDown: function(e: KeyboardEvent, q: string, close: () => void) {
                            if (e.keyCode === KeyboardUtils.keyCodes.enter || e.keyCode === KeyboardUtils.keyCodes.ESC) {
                                close();
                            }
                        }
                    });
                } else {
                    self.onExit = _close;
                    self.exit();
                }
            }
        }
    });

    function createUrlCompleter() {
        var allVisitedURLs: unknown[];
        RUNTIME('getAllURLs', null, function(response) {
            type UrlEntry = { url: string; typedCount?: number; visitCount?: number };
            allVisitedURLs = (response.urls as UrlEntry[]).map(function(u) {
                var typedCount = 0, visitCount = 1;
                if (u.hasOwnProperty('typedCount')) {
                    typedCount = u.typedCount ?? 0;
                }
                if (u.hasOwnProperty('visitCount')) {
                    visitCount = u.visitCount ?? 1;
                }
                return {
                    caption: u.url,
                    value: u.url,
                    score: typedCount*10 + visitCount,
                    meta: 'local'
                };
            });
        });
        return {
            identifierRegexps: [/.*/],
            getCompletions: function(_editor: unknown, _session: unknown, _pos: unknown, _prefix: unknown, callback: (err: null, results: unknown[]) => void) {
                callback(null, allVisitedURLs);
            }
        };
    }

    var wordsOnPage: unknown[] | null = null;
    function getWordsOnPage(message: string) {
        var splitRegex = /[^a-zA-Z_0-9\$\-\u00C0-\u1FFF\u2C00-\uD7FF\w]+/;
        var words = message.split(splitRegex);
        var wordScores: Record<string, number> = {};
        words.forEach(function(word: string) {
            word = "sk_" + word;
            if (wordScores.hasOwnProperty(word)) {
                wordScores[word]++;
            } else {
                wordScores[word] = 1;
            }
        });

        return Object.keys(wordScores).map(function(w) {
            w = w.substr(3);
            return {
                caption: w,
                value: w,
                score: wordScores[w],
                meta: 'local'
            };
        });
    };

    var pageWordCompleter = {
        getCompletions: function(_editor: unknown, _session: unknown, _pos: unknown, _prefix: unknown, callback: (err: null, results: unknown[]) => void) {
            if (!wordsOnPage) {
                (front.contentCommand as (args: Record<string, unknown>, cb: (result: unknown) => void) => void)({
                    action: 'getPageText'
                }, function(message: unknown) {
                    wordsOnPage = getWordsOnPage((message as Record<string, unknown>).data as string);
                    callback(null, wordsOnPage!);
                });
            } else {
                callback(null, wordsOnPage);
            }
        }
    };

    ace.config.loadModule('ace/ext/language_tools', function (mod: AceModule) {
        _ace.language_tools = { setCompleters: (mod as unknown as { setCompleters: (c: unknown[]) => void }).setCompleters?.bind(mod) };
        ace.config.loadModule('ace/autocomplete', function (mod: AceModule) {
            if (mod.Autocomplete) {
                mod.Autocomplete.startCommand.bindKey = "Tab";
                mod.Autocomplete.prototype.commands['Space'] = mod.Autocomplete.prototype.commands['Tab'];
                mod.Autocomplete.prototype.commands['Tab'] = mod.Autocomplete.prototype.commands['Down'];
                mod.Autocomplete.prototype.commands['Shift-Tab'] = mod.Autocomplete.prototype.commands['Up'];
            }
            if (mod.FilteredList) {
            mod.FilteredList.prototype.filterCompletions = function(items: unknown[], needle: string) {
                var results: unknown[] = [];
                var upper = needle.toUpperCase();
                loop: for (var i = 0; i < items.length; i++) {
                    const item = items[i] as { value: string; matchMask?: number; exactMatch?: number };
                    var caption = item.value.toUpperCase();
                    if (!caption) continue;
                    var index = caption.indexOf(upper), matchMask = 0;

                    if (index === -1)
                        continue loop;
                    matchMask = matchMask | (Math.pow(2, needle.length) - 1 << index);
                    item.matchMask = matchMask;
                    item.exactMatch = 0;
                    results.push(item);
                }
                return results;
            };
            } // end if (mod.FilteredList)
        });
        _ace.setOptions({
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: false,
            enableSnippets: false
        });
    });

    var _editorType: string | undefined;
    function _getValue(): string {
        var val = _ace.getValue();
        if (_editorType === 'select') {
            // get current line
            const lineVal = _ace.session.getLine(_ace.selection.lead.row);
            const m = lineVal.match(/.*>< ([^<]*)$/);
            val = m ? m[1] : "";
        }
        return val;
    }
    function aceKeyboardVimLoaded() {
        var cm = _ace.state.cm;
        cm.mode = "normal";
        cm.on('vim-mode-change', function(data: unknown) {
            cm.mode = (data as { mode: string }).mode;
        });
        cm.on('0-register-set', function(data: unknown) {
            var lf = document.activeElement;
            (Clipboard as unknown as { write(text: string): void }).write((data as { text: string }).text);
            (lf as HTMLElement).focus();
        });
        var vim = cm.constructor.Vim;
        vim.defineEx("write", "w", function(_cm: unknown, _input: unknown) {
            _save();
        });
        const wq = function(_cm: unknown, _input: unknown) {
            self.onExit = _closeAndSave;
            self.exit();
            // tell vim editor that command is done
            _ace.state.cm.signal('vim-command-done', '');
        };
        vim.defineEx("wq", "wq", wq);
        vim.defineEx("x", "x", wq);
        vim.map('<CR>', ':wq<CR>', 'normal');
        vim.defineEx("bnext", "bn", function(_cm: unknown, _input: unknown) {
            (front.contentCommand as (args: Record<string, unknown>) => void)({
                action: 'nextEdit',
                backward: false
            });
        });
        vim.defineEx("bprevious", "bp", function(_cm: unknown, _input: unknown) {
            (front.contentCommand as (args: Record<string, unknown>) => void)({
                action: 'nextEdit',
                backward: true
            });
        });
        vim.defineEx("quit", "q", function(_cm: unknown, _input: unknown) {
            self.onExit = _close;
            self.exit();
            _ace.state.cm.signal('vim-command-done', '');
        });
        (front.vimMappings as unknown[][]).forEach(function(a: unknown[]) {
            vim.apply(vim, a);
        });
        var dk = _ace.getKeyboardHandler().defaultKeymap;
        const vkm = front.vimKeyMap as unknown[] | undefined;
        if (vkm && vkm.length) {
            (dk.unshift as (...args: unknown[]) => void).apply(dk, vkm);
        }
        return vim;
    }
    function aceKeyboardEmacsLoaded() {
        _ace.$emacsModeHandler.addCommands({
            closeAndSave: {
                exec: function(_editor: unknown) {
                    self.onExit = _closeAndSave;
                    self.exit();
                },
                readOnly: true
            }
        });
        _ace.$emacsModeHandler.bindKey("C-x C-s", "closeAndSave");
        return _ace.$emacsModeHandler;
    }
    _ace.setTheme("ace/theme/monokai");
    var keybindingsDeferred = new Promise(function(resolve, _reject) {
        var aceKeyboardLoaded: () => unknown = aceKeyboardVimLoaded;
        if (runtime.conf.aceKeybindings === "emacs") {
            aceKeyboardLoaded = aceKeyboardEmacsLoaded;
        } else {
            runtime.conf.aceKeybindings = "vim";
        }
        _ace.setKeyboardHandler('ace/keyboard/' + runtime.conf.aceKeybindings, function() {
            resolve(aceKeyboardLoaded());
        });
    });
    _ace.container.style.background = "#f1f1f1";
    _ace.$blockScrolling = Infinity;

    self.show = function(message: Record<string, unknown>) {
        keybindingsDeferred.then(function(vim: unknown) {
            const vimKb = vim as AceVim;
            _ace.setValue(message.content as string, -1);
            originValue = message.content as string;
            _ace.container.querySelector('textarea')?.focus();
            self.enter();
            _editorType = message.type as string | undefined;
            _ace.setFontSize(16);

            if (vimKb.$id === "ace/keyboard/emacs") {
                if (message.type === 'url') {
                    _ace.setOption('showLineNumbers', false);
                    _ace.language_tools?.setCompleters([createUrlCompleter()]);
                    _ace.container.style.height = "30%";
                } else if (message.type === 'input') {
                    _ace.setOption('showLineNumbers', false);
                    _ace.language_tools?.setCompleters([pageWordCompleter]);
                    _ace.container.style.height = "";
                } else {
                    _ace.setOption('showLineNumbers', true);
                    _ace.language_tools?.setCompleters([pageWordCompleter]);
                    _ace.container.style.height = "30%";
                }
                _ace.setReadOnly(message.type === 'select');

                // reset undo
                setTimeout( function () {
                    _ace.renderer.session.$undoManager.reset();
                }, 1);
            } else {
                vimKb.unmap('<CR>', 'insert');
                vimKb.unmap('<C-CR>', 'insert');
                if (message.type === 'url') {
                    vimKb.map('<CR>', '<Esc>:wq<CR>', 'insert');
                    _ace.setOption('showLineNumbers', false);
                    _ace.language_tools?.setCompleters([createUrlCompleter()]);
                    _ace.container.style.height = "30%";
                } else if (message.type === 'input') {
                    vimKb.map('<CR>', '<Esc>:wq<CR>', 'insert');
                    _ace.setOption('showLineNumbers', false);
                    _ace.language_tools?.setCompleters([pageWordCompleter]);
                    _ace.container.style.height = "16px";
                } else {
                    vimKb.map('<C-CR>', '<Esc>:wq<CR>', 'insert');
                    _ace.setOption('showLineNumbers', true);
                    _ace.language_tools?.setCompleters([pageWordCompleter]);
                    _ace.container.style.height = "30%";
                }
                _ace.setReadOnly(message.type === 'select');
                vimKb.map('<C-d>', '<C-w>', 'insert');
                vimKb.exitInsertMode(_ace.state.cm);

                // set cursor at initial line
                _ace.state.cm.setCursor(message.initial_line as number, 0);
                _ace.state.cm.ace.renderer.scrollCursorIntoView();
                // reset undo
                setTimeout( function () {
                    _ace.renderer.session.$undoManager.reset();
                }, 1);

                _ace.state.cm.ace.setOption('indentedSoftWrap', false);
                _ace.state.cm.ace.setOption('wrap', true);
            }
        });
    };

    return self;
}

export default Front;
