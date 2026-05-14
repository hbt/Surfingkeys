import type { ModeConstructor, ModeInstance } from '../../@types/surfingkeys';

type RuntimeFn = (action: string, args?: Record<string, unknown> | null, callback?: (response: Record<string, unknown>) => void) => void;

// ace is a global declared as `any` in @types/surfingkeys.d.ts — fully dynamic API

export default function(
    RUNTIME: RuntimeFn,
    KeyboardUtils: Record<string, (...args: unknown[]) => unknown>,
    Mode: ModeConstructor,
    createElementWithContent: (tag: string, content?: string, attributes?: Record<string, string>) => HTMLElement,
    getBrowserName: () => string,
    htmlEncode: (str: string) => string,
    initL10n: (cb: (translate: (str: string) => string) => void) => void,
    reportIssue: (title: string, description: string) => void,
    setSanitizedContent: (elm: Element | null, str: string) => void,
    showBanner: (msg: string, timeout?: number) => void,
) {
    var mappingsEditor: ModeInstance | null = null;
    function createMappingEditor(elmId: string): ModeInstance {
        var _ace = ace.edit(elmId);
        _ace.mode = "normal";

        var self = new Mode("mappingsEditor") as ModeInstance & {
            container: unknown;
            setValue: (v: string, cursorPos: number) => void;
            getValue: () => string;
        };

        self.container = _ace.container;
        self.setValue = function(v: string, cursorPos: number) {
            _ace.setValue(v, cursorPos);
        };
        self.getValue = function() {
            return _ace.getValue();
        };

        self.addEventListener('keydown', function(event) {
            event.sk_suppressed = true;
            if (Mode.isSpecialKeyOf("<Esc>", event.sk_keyName)
                && _ace.mode === 'normal' // vim in normal mode
                && (_ace.state.cm.state.vim.status === null || _ace.state.cm.state.vim.status === "") // and no pending normal operation
            ) {
                (document.activeElement as HTMLElement).blur();
                self.exit();
            }
        });
        (document.querySelector('#mappings textarea') as HTMLElement)!.onfocus = function() {
            setTimeout(function() {
                self.enter(0, true);
            }, 10);
        };

        _ace.setTheme("ace/theme/monokai");
        ace.config.loadModule('ace/ext/language_tools', function (_mod: unknown) {
            ace.config.loadModule('ace/autocomplete', function (mod: Record<string, unknown>) {
                const Autocomplete = mod.Autocomplete as Record<string, unknown>;
                (Autocomplete.startCommand as Record<string, unknown>).bindKey = "Tab";
                const proto = Autocomplete.prototype as Record<string, unknown>;
                const cmds = proto.commands as Record<string, unknown>;
                cmds['Space'] = cmds['Tab'];
                cmds['Tab'] = cmds['Down'];
                cmds['Shift-Tab'] = cmds['Up'];
            });
            _ace.setOptions({
                enableBasicAutocompletion: true,
                enableLiveAutocompletion: false,
                enableSnippets: false
            });
        });
        _ace.setKeyboardHandler('ace/keyboard/vim', function() {
            var cm = _ace.state.cm;
            cm.on('vim-mode-change', function(data: { mode: string }) {
                _ace.mode = data.mode;
            });
            cm.constructor.Vim.defineEx("write", "w", function(_cm: unknown, _input: unknown) {
                saveSettings();
            });
            cm.constructor.Vim.defineEx("quit", "q", function(_cm: unknown, _input: unknown) {
                window.close();
            });
        });
        _ace.getSession().setMode("ace/mode/javascript");
        _ace.$blockScrolling = Infinity;

        return self;
    }

    if (getBrowserName() === "Firefox") {
        (document.querySelector("#localPathForSettings") as HTMLElement)!.style.display = "";
        (document.querySelector("#proxySettings") as HTMLElement)!.style.display = "none";
    } else if (getBrowserName().startsWith("Safari")) {
        document.querySelector("#localPathHelpForFile")!.remove();
        (document.querySelector("#proxySettings") as HTMLElement)!.style.display = "none";
        (document.querySelector("#donationDiv") as HTMLElement)!.style.display = "none";
    }
    var proxyModeSelect = document.querySelector("#proxyMode>select") as HTMLSelectElement;
    var proxyGroup = document.getElementById("proxyMode")!.parentElement!;
    var addProxyPair = document.getElementById('addProxyPair')!;
    addProxyPair.onclick = function () {
        _updateProxy({
            number: document.querySelectorAll('div.proxyPair').length,
            proxy: "SOCKS5 127.0.0.1:1080"
        });
    };

    function renderAutoproxyHosts(rs: Record<string, unknown>, divProxyPair: Element, number: number) {
        var desc = "For below hosts, above proxy will be used, click ❌ to remove one.";
        if (rs.proxyMode === "bypass") {
            desc = "For below hosts, <b>NO</b> proxy will be used, click ❌ to remove one.";
        }
        setSanitizedContent(divProxyPair.querySelector('.autoproxy_hosts>h3'), desc);

        var autoproxyHostsInput = divProxyPair.querySelector(".autoproxy_hosts>input") as HTMLInputElement;

        var ih = autoproxyHostsInput.value;
        autoproxyHostsInput.value = "";
        const autoproxy_hosts_list = rs.autoproxy_hosts as string[][];
        var autoproxy_hosts = autoproxy_hosts_list[number].sort().map(function(h: string) {
            return `<div class='aphost'><span class='remove'>❌</span><span class="${h === ih ? 'highlight' : ''}">${h}</span></div>`;
        }).join("");
        setSanitizedContent(divProxyPair.querySelector('.autoproxy_hosts>div'), autoproxy_hosts);

        var autoproxyHostsDiv = divProxyPair.querySelector(".autoproxy_hosts")!;
        autoproxyHostsDiv.querySelectorAll('div.aphost>span.remove').forEach(function(ph: Element) {
            ph.onclick = function() {
                var elm = (this as HTMLElement).closest('div.aphost')!;
                RUNTIME('updateProxy', {
                    number: number,
                    host: (elm.querySelector("span:nth-child(2)") as HTMLElement).innerText,
                    operation: 'remove'
                }, function() {
                    elm.remove();
                });
            };
        });

        function addAutoProxyHost() {
            _updateProxy({
                number: number,
                host: autoproxyHostsInput.value,
                operation: 'add'
            });
        }

        autoproxyHostsInput.onkeyup = function(e: KeyboardEvent) {
            if (e.keyCode === 13) {
                addAutoProxyHost();
            }
        };

        (divProxyPair.querySelector('.autoproxy_hosts>button') as HTMLElement).onclick = addAutoProxyHost;

        (divProxyPair.querySelector('.deleteProxyPair') as HTMLElement).onclick = function() {
            _updateProxy({
                number: number,
                operation: "deleteProxyPair"
            });
        };
    }

    function renderProxyPair(proxy: string, number: number) {
        var divProxyPair: Element = document.querySelector(`div.proxyPair[number='${number}']`) as Element;
        if (!divProxyPair) {
            divProxyPair = createElementWithContent('div',
                document.getElementById("templateProxyPair")!.innerHTML.trim(), {"class": "proxyPair", "number": String(number)});
            proxyGroup.insertBefore(divProxyPair, addProxyPair);
        }

        var proxySelect = divProxyPair.querySelector(".proxy>select") as HTMLSelectElement;
        var proxyInput = divProxyPair.querySelector(".proxy>input") as HTMLInputElement;

        function __updateProxy(_data: Event) {
            let v = proxyInput.value.replace(/\W+([0-9]+)$/, ":$1");
            _updateProxy({
                number: number,
                proxy: proxySelect.value + " " + v
            });
        }

        proxySelect.onchange = __updateProxy;
        proxyInput.onblur = __updateProxy;

        var p = proxy.split(/\s+/);
        if (p.length > 0) {
            proxySelect.value = p[0];
            proxyInput.value = p[1];
        } else {
            proxySelect.value = "PROXY";
        }
        return divProxyPair;
    }

    function renderProxySettings(rs: Record<string, unknown>) {
        (proxyModeSelect as HTMLSelectElement).value = rs.proxyMode as string;
        (proxyModeSelect as HTMLSelectElement).onchange = function() {
            _updateProxy({
                mode: this.value
            });
        };
        document.querySelectorAll('#proxyMode span[mode]').forEach(function(span) {
            span.hide();
        });
        (document.querySelector(`#proxyMode span[mode=${rs.proxyMode}]`) as Element | null)?.show();
        if (rs.proxyMode === "always" || rs.proxyMode === "byhost" || rs.proxyMode === "bypass") {

            document.querySelectorAll('div.proxyPair').remove();
            const proxyList = rs.proxy as string[];
            if (rs.proxyMode === "always") {
                var pp = renderProxyPair(proxyList[0], 0);
                (pp.querySelector('.autoproxy_hosts') as Element | null)?.hide();
                addProxyPair.hide();
            } else {
                proxyList.forEach(function(proxy: string, number: number) {
                    var pp = renderProxyPair(proxy, number);
                    (pp.querySelector('.autoproxy_hosts') as Element | null)?.show();
                    renderAutoproxyHosts(rs, pp, number);
                });
                addProxyPair.show();
            }
            var deleteProxyPairs = document.querySelectorAll('div.deleteProxyPair');
            if (deleteProxyPairs.length > 1) {
                deleteProxyPairs.show();
            } else {
                deleteProxyPairs.hide();
            }
        }
    }

    function _updateProxy(data: Record<string, unknown>) {
        RUNTIME('updateProxy', data, function(res: Record<string, unknown>) {
            renderProxySettings(res);
        });
    }

    const basicSettingsDiv = document.getElementById("basicSettings")!;
    const basicMappingsDiv = document.getElementById("basicMappings")!;
    const advancedSettingDiv = document.getElementById("advancedSetting")!;
    const advancedToggler = document.getElementById("advancedToggler") as HTMLInputElement;
    function showAdvanced(flag: boolean) {
        if (flag) {
            basicSettingsDiv.hide();
            advancedSettingDiv.show();
            advancedToggler.setAttribute('checked', 'checked');
        } else {
            basicSettingsDiv.show();
            advancedSettingDiv.hide();
            advancedToggler.removeAttribute('checked');
        }
    }

    var localPathSaved = "";
    var localPathInput = document.getElementById("localPath") as HTMLInputElement;
    var sample = document.getElementById("sample")!.innerHTML;
    function renderSettings(rs: Record<string, unknown>) {
        if (rs.isMV3) {
            document.getElementById("advancedTip")!.innerText = "First turn on 'Developer mode' in chrome://extensions/, then turn on 'Allow User Scripts' in Surfingkeys extension details, then toggle the 'Advanced mode' flag here.";
            advancedToggler.disabled = !(rs.isUserScriptsAvailable as boolean);
            showAdvanced(!!(rs.isUserScriptsAvailable) && !!(rs.showAdvanced));
        } else {
            showAdvanced(!!(rs.showAdvanced));
        }
        if (rs.localPath) {
            localPathInput.value = rs.localPath as string;
            localPathSaved = rs.localPath as string;
        }
        var h = window.innerHeight / 2;
        (mappingsEditor as ModeInstance & { container: HTMLElement; setValue: (v: string, n: number) => void }).container.style.height = h + "px";
        const editorRef = mappingsEditor as ModeInstance & { setValue: (v: string, n: number) => void };
        if (rs.snippets && (rs.snippets as string).length) {
            editorRef.setValue(rs.snippets as string, -1);
        } else {
            editorRef.setValue(sample, -1);
        }

        renderProxySettings(rs);
    }


    advancedToggler.onclick = function() {
        var newFlag = this.checked;
        RUNTIME('updateSettings', {
            settings: {
                showAdvanced: newFlag
            }
        }, (resp: Record<string, unknown>) => {
            if (resp.error) {
                showBanner(resp.error as string, 3000);
            } else {
                showAdvanced(newFlag);
            }
        });
    };
    document.getElementById('resetSettings')!.onclick = function() {
        if ((this as HTMLElement).innerText === "Reset") {
            (this as HTMLElement).innerText = "WARNING! This will clear all your settings. Click this again to continue.";
        } else {
            RUNTIME("resetSettings", null, function(response: Record<string, unknown>) {
                renderSettings(response.settings as Record<string, unknown>);
                renderKeyMappings(response.settings as Record<string, unknown>);
                showBanner('Settings reset', 1000);
            });
        }
    };

    (document.querySelector('.infoPointer') as HTMLElement)!.onclick = function() {
        var f = document.getElementById((this as HTMLElement).getAttribute("for")!);
        if (f!.style.display === "none") {
            f!.style.display = "";
        } else {
            f!.style.display = "none";
        }
    };

    function getURIPath(fn: string) {
        if (fn.length && !/^\w+:\/\/\w+/i.test(fn) && fn.indexOf('file:///') === -1) {
            fn = fn.replace(/\\/g, '/');
            if (fn[0] === '/') {
                fn = fn.substr(1);
            }
            fn = "file:///" + fn;
        }
        return fn;
    }
    function saveSettings() {
        var settingsCode = (mappingsEditor as ModeInstance & { getValue: () => string }).getValue();
        var localPath = getURIPath(localPathInput.value.trim());
        if (localPath.length && localPath !== localPathSaved) {
            RUNTIME('loadSettingsFromUrl', {
                url: localPath
            }, function(res: Record<string, unknown>) {
                showBanner((res.status as string) + ' to load settings from ' + localPath, 5000);
                renderKeyMappings(res);
                if (res.snippets && (res.snippets as string).length) {
                    localPathSaved = localPath;
                    (mappingsEditor as ModeInstance & { setValue: (v: string, n: number) => void }).setValue(res.snippets as string, -1);
                } else if (settingsCode === "") {
                    (mappingsEditor as ModeInstance & { setValue: (v: string, n: number) => void }).setValue(sample, -1);
                }
            });
        } else {
            RUNTIME('updateSettings', {
                settings: {
                    snippets: settingsCode,
                    localPath: getURIPath(localPathInput.value)
                }
            });

            showBanner('Settings saved', 1000);
        }
    }
    document.getElementById('save_button')!.onclick = saveSettings;

    interface BasicMappingEntry {
        origin: string;
        annotation: unknown;
    }

    var basicMappings: Array<BasicMappingEntry | null> = ['d', 'R', 'f', 'E', 'e', 'x', 'gg', 'j', '/', 'n', 'r', 'k', 'S', 'C', 'on', 'G', 'v', 'i', ';e', 'og', 'g0', 't', '<Ctrl-6>', 'yy', 'g$', 'D', 'ob', 'X', 'sg', 'cf', 'yv', 'yt', 'N', 'l', 'cc', '$', 'yf', 'w', '0', 'yg', 'ow', 'cs', 'b', 'om', 'ya', 'h', 'gU', 'W', 'B', 'F', ';j'].map(w => ({ origin: w, annotation: null }));


    document.addEventListener("surfingkeys:defaultSettingsLoaded", function(evt) {
        const { normal } = (evt as CustomEvent).detail[0] as { normal: ModeInstance };
        basicMappings = (basicMappings as BasicMappingEntry[]).map(function(w: BasicMappingEntry) {
            const binding = normal.mappings.find(KeyboardUtils.encodeKeystroke(w.origin) as string);
            if (binding) {
                return {
                    origin: w.origin,
                    annotation: (binding as Record<string, unknown> & { meta?: Record<string, unknown> }).meta?.annotation
                };
            } else {
                return null;
            }
        }).filter((m): m is BasicMappingEntry => m !== null);
    });

    function renderSearchAlias(frontCommand: (args: Record<string, unknown>, cb: (response: Record<string, unknown>) => void) => void, disabledSearchAliases: Record<string, string>) {
        new Promise<Record<string, unknown>>((r, _j) => {
            const getSearchAliases = () => {
                frontCommand({
                    action: 'getSearchAliases'
                }, function(response: Record<string, unknown>) {
                    if (Object.keys(response.aliases as Record<string, unknown>).length > 0) {
                        r(response.aliases as Record<string, unknown>);
                    } else {
                        setTimeout(getSearchAliases, 300);
                    }
                });
            };
            getSearchAliases();
        }).then((aliases) => {
            const allAliases: Record<string, { prompt: string; checked: string }> = {};
            for (const key in aliases) {
                let prompt = (aliases[key] as { prompt: string }).prompt;
                if (!prompt.startsWith("<img src=")) {
                    prompt = prompt.replace(/<span class='separator'>.*/, '');
                }
                allAliases[key] = { prompt, checked: "checked" };
            }
            for (const key in disabledSearchAliases) {
                allAliases[key] = { prompt: disabledSearchAliases[key], checked: "" };
            }
            for (const key in allAliases) {
                const { prompt, checked } = allAliases[key];
                const elm = createElementWithContent("div", `<div class='remove'><input type="checkbox" ${checked} /></div><span class='prompt'>${prompt}</span>`);
                document.querySelector("#searchAliases")!.appendChild(elm);

                (elm.querySelector("input") as HTMLInputElement).onchange = () => {
                    if (disabledSearchAliases.hasOwnProperty(key)) {
                        delete disabledSearchAliases[key];
                    } else {
                        disabledSearchAliases[key] = prompt;
                    }

                    RUNTIME('updateSettings', {
                        settings: {
                            disabledSearchAliases
                        }
                    });
                };
            }
        });
    }

    function renderKeyMappings(rs: Record<string, unknown>) {
        initL10n(function (locale: (str: string) => string) {
            var customization = (basicMappings as BasicMappingEntry[]).map(function (w: BasicMappingEntry) {
                var newKey = w.origin;
                const bm = rs.basicMappings as Record<string, string> | undefined;
                if (bm && bm.hasOwnProperty(w.origin)) {
                    newKey = bm[w.origin];
                }
                return `<div>
                    <span class=annotation>${locale(w.annotation as string)}</span>
                    <span class=kbd-span><kbd data-origin="${w.origin}" data-custom="${newKey}">${newKey ? htmlEncode(newKey) : "🚫"}</kbd></span>
                </div>`;
            });

            setSanitizedContent(basicMappingsDiv, customization.join(""));
            basicMappingsDiv.querySelectorAll("kbd").forEach(function(d) {
                d.onclick = function () {
                    (KeyPicker as unknown as { enter: (elm: HTMLElement) => void }).enter(this as HTMLElement);
                };
            });
        });
    }

    document.addEventListener("surfingkeys:userSettingsLoaded", function(evt) {
        const { settings, disabledSearchAliases, frontCommand } = (evt as CustomEvent).detail[0] as {
            settings: Record<string, unknown>;
            disabledSearchAliases: Record<string, string>;
            frontCommand: (args: Record<string, unknown>, cb: (response: Record<string, unknown>) => void) => void;
        };
        mappingsEditor = createMappingEditor('mappings');
        renderSettings(settings);
        if ('error' in settings) {
            showBanner(settings.error as string, 5000);
        }
        renderSearchAlias(frontCommand, disabledSearchAliases || {});
        renderKeyMappings(settings);
    });

    var KeyPicker = (function() {
        var self = new Mode("KeyPicker");

        function showKey() {
            var s = htmlEncode(_key);
            if (!s) {
                s = "&nbsp;";
            }
            setSanitizedContent(document.getElementById("inputKey"), s);
        }

        var _key = "";
        var keyPickerDiv = document.getElementById("keyPicker")!;
        self.addEventListener('keydown', function(event) {
            if (event.keyCode === 27) {
                keyPickerDiv.hide();
                self.exit();
            } else if (event.keyCode === 8) {
                var ek = KeyboardUtils.encodeKeystroke(_key) as string;
                ek = ek.substr(0, ek.length - 1);
                _key = KeyboardUtils.decodeKeystroke(ek) as string;
                showKey();
            } else if (event.keyCode === 13) {
                keyPickerDiv.hide();
                self.exit();
                setSanitizedContent(_elm as Element, (_key !== "") ? htmlEncode(_key) : "🚫");
                (_elm as HTMLElement).dataset.custom = _key;
                const realDefMap: Record<string, string | undefined> = {};
                Array.from(basicMappingsDiv.querySelectorAll("kbd")).forEach((m) => {
                    var n = (m as HTMLElement).dataset.custom;
                    if ((m as HTMLElement).dataset.origin !== n) {
                        realDefMap[(m as HTMLElement).dataset.origin!] = n;
                    }
                });
                RUNTIME('updateSettings', {
                    settings: {
                        basicMappings: realDefMap
                    }
                });
            } else {
                if (event.sk_keyName.length > 1) {
                    var keyStr = JSON.stringify({
                        metaKey: event.metaKey,
                        altKey: event.altKey,
                        ctrlKey: event.ctrlKey,
                        shiftKey: event.shiftKey,
                        keyCode: event.keyCode,
                        code: event.code,
                        composed: event.composed,
                        key: event.key
                    }, null, 4);
                    reportIssue(`Unrecognized key event: ${event.sk_keyName}`, keyStr);
                } else {
                    _key += KeyboardUtils.decodeKeystroke(event.sk_keyName) as string;
                    showKey();
                }
            }
            event.sk_stopPropagation = true;
        });

        var _elm: HTMLElement | null = null;
        var _enter = self.enter;
        (self as unknown as { enter: (elm: HTMLElement) => void }).enter = function(elm: HTMLElement) {
            _enter.call(self);

            _key = elm.innerText;
            if (_key === "🚫") {
                _key = "";
            }

            showKey();
            keyPickerDiv.show();
            _elm = elm;
        };

        return self;
    })();
}
