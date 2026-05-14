import { RUNTIME, runtime } from '../runtime.js';
import { getBrowserName, showBanner, showImagePopup } from '../utils.js';
import type { CommandAPI, ClipboardManager, HintsModule, FrontendAPI } from '../../../../@types/surfingkeys';

type RTWithRepeats = typeof RUNTIME & { repeats: number };

function getTableColumnHeads(): Element[] {
    var tds: Element[] = [];
    document.querySelectorAll("table").forEach(function(t) {
        var tr = t.querySelector("tr");
        if (tr) {
            tds.push(...tr.children);
        }
    });
    return tds;
}

function getFormData(form: HTMLFormElement, format?: string): Record<string, unknown> | string {
    var formData = new FormData(form);
    if (format === "json") {
        var obj: Record<string, unknown> = {};

        formData.forEach(function (value, key) {
            if (obj.hasOwnProperty(key)) {
                if ((value as string).length) {
                    var p = obj[key];
                    if (Array.isArray(p)) {
                        p.push(value);
                    } else {
                        obj[key] = [];
                        if ((p as string).length) {
                            (obj[key] as unknown[]).push(p);
                        }
                        (obj[key] as unknown[]).push(value);
                    }
                }
            } else {
                obj[key] = value;
            }
        });

        return obj;
    } else {
        return new URLSearchParams(formData as unknown as URLSearchParams).toString();
    }
}

function generateFormKey(form: HTMLFormElement): string {
    return (form.method || "get") + "::" + new URL(form.action).pathname;
}

export default function registerClipboard(
    api: CommandAPI,
    clipboard: unknown,
    _insert: unknown,
    _normal: unknown,
    hints: unknown,
    _visual: unknown,
    front: unknown,
    _browser: unknown
): void {
    const cb = clipboard as ClipboardManager;
    const hn = hints as HintsModule;
    const fr = front as FrontendAPI;
    const { mapkey } = api;

    mapkey('yv', {
        short: "Yank text of element",
        unique_id: "cmd_yank_element_text",
        feature_group: 7,
        category: "clipboard",
        description: "Copy text content of a selected element to clipboard",
        tags: ["clipboard", "yank", "element"]
    }, function() {
        hn.create(runtime.conf.textAnchorPat, function (element) {
            const el = element as [Node & { data: string }, number, string];
            cb.write(el[1] === 0 ? el[0].data.trim() : el[2].trim());
        });
    });
    mapkey('ymv', {
        short: "Yank text of multiple elements",
        unique_id: "cmd_yank_multiple_elements",
        feature_group: 7,
        category: "clipboard",
        description: "Copy text from multiple elements to clipboard as separate lines",
        tags: ["clipboard", "yank", "multiple"]
    }, function() {
        var textToYank: string[] = [];
        hn.create(runtime.conf.textAnchorPat, function (element) {
            const el = element as [Node & { data: string }, number, string];
            textToYank.push(el[1] === 0 ? el[0].data.trim() : el[2].trim());
            cb.write(textToYank.join('\n'));
        }, { multipleHits: true });
    });

    mapkey(';pp', {
        short: "Paste html on page",
        unique_id: "cmd_paste_html",
        feature_group: 7,
        category: "clipboard",
        description: "Replace current page content with HTML from clipboard",
        tags: ["clipboard", "paste", "html"]
    }, function() {
        cb.read(function(response) {
            (document.documentElement as unknown as { removeAttributes(): void }).removeAttributes();
            (document.body as unknown as { removeAttributes(): void }).removeAttributes();
            document.head.innerHTML = "<title>" + new Date() +" updated by Surfingkeys</title>";
            document.body.innerHTML = response.data;
        });
    });

    mapkey('ya', {
        short: "Copy link URL",
        unique_id: "cmd_yank_link_url",
        feature_group: 7,
        category: "clipboard",
        description: "Copy URL of a selected link to clipboard",
        tags: ["clipboard", "yank", "link"]
    }, function() {
        hn.create('*[href]', function(element) {
            cb.write((element as HTMLAnchorElement).href);
        });
    });
    mapkey('yma', {
        short: "Copy multiple link URLs",
        unique_id: "cmd_yank_multiple_links",
        feature_group: 7,
        category: "clipboard",
        description: "Copy URLs of multiple links to clipboard as separate lines",
        tags: ["clipboard", "yank", "multiple"]
    }, function() {
        var linksToYank: string[] = [];
        hn.create('*[href]', function(element) {
            linksToYank.push((element as HTMLAnchorElement).href);
            cb.write(linksToYank.join('\n'));
        }, {multipleHits: true});
    });

    mapkey('yc', {
        short: "Copy table column",
        unique_id: "cmd_yank_table_column",
        feature_group: 7,
        category: "clipboard",
        description: "Copy all cells from a selected table column to clipboard",
        tags: ["clipboard", "yank", "table"]
    }, function() {
        hn.create(getTableColumnHeads(), function(element) {
            const cell = element as HTMLTableCellElement;
            var column = Array.from(cell.closest("table")!.querySelectorAll("tr")).map(function(tr) {
                return tr.children.length > cell.cellIndex ? (tr.children[cell.cellIndex] as HTMLElement).innerText : "";
            });
            cb.write(column.join("\n"));
        });
    });
    mapkey('ymc', {
        short: "Copy multiple table columns",
        unique_id: "cmd_yank_table_columns",
        feature_group: 7,
        category: "clipboard",
        description: "Copy multiple table columns to clipboard as tab-separated values",
        tags: ["clipboard", "yank", "table"]
    }, function() {
        var rows: string[] | null = null;
        hn.create(getTableColumnHeads(), function(element) {
            const cell = element as HTMLTableCellElement;
            var column = Array.from(cell.closest("table")!.querySelectorAll("tr")).map(function(tr) {
                return tr.children.length > cell.cellIndex ? (tr.children[cell.cellIndex] as HTMLElement).innerText : "";
            });
            if (!rows) {
                rows = column as string[];
            } else {
                (column as string[]).forEach(function(c, i) {
                    rows![i] += "\t" + c;
                });
            }
            cb.write(rows!.join("\n"));
        }, {multipleHits: true});
    });
    mapkey('yq', {
        short: "Copy pre text",
        unique_id: "cmd_yank_pre_text",
        feature_group: 7,
        category: "clipboard",
        description: "Copy text from a selected pre element to clipboard",
        tags: ["clipboard", "yank", "code"]
    }, function() {
        hn.create("pre", function(element) {
            cb.write((element as HTMLElement).innerText);
        });
    });

    mapkey('yi', {
        short: "Copy input value",
        unique_id: "cmd_yank_input_value",
        feature_group: 7,
        category: "clipboard",
        description: "Copy value from a selected input field to clipboard",
        tags: ["clipboard", "yank", "input"]
    }, function() {
        hn.create("input, textarea, select", function(element) {
            cb.write((element as HTMLInputElement).value);
        });
    });

    mapkey('ys', {
        short: "Copy page source",
        unique_id: "cmd_yank_page_source",
        feature_group: 7,
        category: "clipboard",
        description: "Copy HTML source code of current page to clipboard",
        tags: ["clipboard", "yank", "html"]
    }, function() {
        var aa = document.documentElement.cloneNode(true);
        cb.write((aa as HTMLElement).outerHTML);
    });
    mapkey('yj', {
        short: "Copy settings",
        unique_id: "cmd_yank_settings",
        feature_group: 7,
        category: "clipboard",
        description: "Copy current SurfingKeys settings as JSON to clipboard",
        tags: ["clipboard", "yank", "settings"]
    }, function() {
        RUNTIME('getSettings', {
            key: "RAW"
        }, function(response) {
            cb.write(JSON.stringify((response as { settings: unknown }).settings, null, 4));
        });
    });
    mapkey(';pj', {
        short: "Restore settings from clipboard",
        unique_id: "cmd_paste_settings",
        feature_group: 7,
        category: "clipboard",
        description: "Restore SurfingKeys settings from JSON in clipboard",
        tags: ["clipboard", "paste", "settings"]
    }, function() {
        cb.read(function(response) {
            RUNTIME('updateSettings', {
                settings: JSON.parse(response.data.trim())
            });
        });
    });

    mapkey('yy', {
        short: "Copy current URL",
        unique_id: "cmd_yank_url",
        feature_group: 7,
        category: "clipboard",
        description: "Copy current page URL to clipboard",
        tags: ["clipboard", "yank", "url"]
    }, function() {
        if ((RUNTIME as RTWithRepeats).repeats > 1) {
            const num = (RUNTIME as RTWithRepeats).repeats;
            RUNTIME('getTabs', null, function (response) {
                const tabs = (response as { tabs: { active: boolean; url: string }[] }).tabs;
                const start = tabs.findIndex((t) => t.active);
                const range = tabs.slice(start, start + num);
                cb.write(range.map((tab) => tab.url).join('\n'));
            });
            (RUNTIME as RTWithRepeats).repeats = 1;
        } else {
            var url = window.location.href;
            if (url.indexOf(chrome.runtime.getURL("/pages/pdf_viewer.html")) === 0) {
                const filePos = window.location.search.indexOf("=") + 1;
                url = window.location.search.substr(filePos);
            }
            cb.write(url);
        }
    });
    mapkey('yY', {
        short: "Copy all tabs URLs",
        unique_id: "cmd_yank_all_urls",
        feature_group: 7,
        category: "clipboard",
        description: "Copy URLs of all open tabs to clipboard as separate lines",
        tags: ["clipboard", "yank", "tabs"]
    }, function() {
        RUNTIME('getTabs', null, function (response) {
            const tabs = (response as { tabs: { url: string }[] }).tabs;
            cb.write(tabs.map((tab) => tab.url).join('\n'));
        });
    });
    mapkey('yh', {
        short: "Copy page host",
        unique_id: "cmd_yank_host",
        feature_group: 7,
        category: "clipboard",
        description: "Copy hostname of current page to clipboard",
        tags: ["clipboard", "yank", "host"]
    }, function() {
        var url = new URL(window.location.href);
        cb.write(url.host);
    });
    mapkey('yl', {
        short: "Copy page title",
        unique_id: "cmd_yank_title",
        feature_group: 7,
        category: "clipboard",
        description: "Copy title of current page to clipboard",
        tags: ["clipboard", "yank", "title"]
    }, function() {
        cb.write(document.title);
    });
    mapkey('yQ', {
        short: "Copy query history",
        unique_id: "cmd_yank_query_history",
        feature_group: 7,
        category: "clipboard",
        description: "Copy all OmniQuery search history to clipboard",
        tags: ["clipboard", "yank", "history"]
    }, function() {
        RUNTIME('getSettings', {
            key: 'OmniQueryHistory'
        }, function(response) {
            const settings = (response as { settings: { OmniQueryHistory: string[] } }).settings;
            cb.write(settings.OmniQueryHistory.join("\n"));
        });
    });

    mapkey('yf', {
        short: "Copy form data as JSON",
        unique_id: "cmd_yank_form_json",
        feature_group: 7,
        category: "clipboard",
        description: "Copy form data from current page as JSON to clipboard",
        tags: ["clipboard", "yank", "form"]
    }, function() {
        var fd: Record<string, unknown> = {};
        document.querySelectorAll('form').forEach(function(form) {
            fd[generateFormKey(form)] = getFormData(form, "json");
        });
        cb.write(JSON.stringify(fd, null, 4));
    });
    mapkey(';pf', {
        short: "Fill form from clipboard",
        unique_id: "cmd_paste_form",
        feature_group: 7,
        category: "clipboard",
        description: "Fill form fields with data from clipboard",
        tags: ["clipboard", "paste", "form"]
    }, function() {
        hn.create('form', function(element) {
            const form = element as HTMLFormElement;
            var formKey = generateFormKey(form);
            cb.read(function(response) {
                var forms = JSON.parse(response.data.trim()) as Record<string, Record<string, unknown>>;
                if (forms.hasOwnProperty(formKey)) {
                    var fd = forms[formKey];
                    form.querySelectorAll('input, textarea').forEach(function(ipEl) {
                        const ip = ipEl as HTMLInputElement;
                        if (fd.hasOwnProperty(ip.name) && ip.type !== "hidden") {
                            if (ip.type === "radio") {
                                var op = form.querySelector(`input[name='${ip.name}'][value='${fd[ip.name]}']`) as HTMLInputElement | null;
                                if (op) {
                                    op.checked = true;
                                }
                            } else if (Array.isArray(fd[ip.name])) {
                                form.querySelectorAll(`input[name='${ip.name}']`).forEach(function(ipEl2) {
                                    (ipEl2 as HTMLInputElement).checked = false;
                                });
                                var vals = fd[ip.name] as string[];
                                vals.forEach(function(v) {
                                    var op2 = form.querySelector(`input[name='${ip.name}'][value='${v}']`) as HTMLInputElement | null;
                                    if (op2) {
                                        op2.checked = true;
                                    }
                                });
                            } else if (typeof(fd[ip.name]) === "string") {
                                ip.value = fd[ip.name] as string;
                            }
                        }
                    });
                } else {
                    showBanner("No form data found for your selection from clipboard.");
                }
            });
        });
    });
    mapkey('yp', {
        short: "Copy form data for POST",
        unique_id: "cmd_yank_form_post",
        feature_group: 7,
        category: "clipboard",
        description: "Copy form data formatted for POST request to clipboard",
        tags: ["clipboard", "yank", "form"]
    }, function() {
        var aa: Record<string, unknown>[] = [];
        document.querySelectorAll('form').forEach(function(form) {
            var fd: Record<string, unknown> = {};
            fd[(form.method || "get") + "::" + form.action] = getFormData(form);
            aa.push(fd);
        });
        cb.write(JSON.stringify(aa, null, 4));
    });

    mapkey('yg', {
        short: "Capture current page",
        unique_id: "cmd_yank_screenshot",
        feature_group: 7,
        category: "clipboard",
        description: "Capture screenshot of current page, show in popup with download and clipboard options",
        tags: ["clipboard", "screenshot", "capture"]
    }, function() {
        fr.toggleStatus(false);
        setTimeout(function() {
            RUNTIME('captureVisibleTab', null, function(response) {
                fr.toggleStatus(true);
                showImagePopup((response as { dataUrl: string }).dataUrl);
            });
        }, 500);
    });

    if (!getBrowserName().startsWith("Safari")) {
    mapkey('yd', {
        short: "Copy downloading URL",
        unique_id: "cmd_yank_download_url",
        feature_group: 7,
        category: "clipboard",
        description: "Copy URLs of files currently being downloaded to clipboard",
        tags: ["clipboard", "yank", "download"]
    }, function() {
        RUNTIME('getDownloads', {
            query: {state: "in_progress"}
        }, function(response) {
            const items = (response as { downloads: { url: string }[] }).downloads.map(function(o) {
                return o.url;
            });
            cb.write(items.join(','));
        });
    });

    mapkey(';ph', {
        short: "Put histories from clipboard",
        unique_id: "cmd_paste_history",
        feature_group: 14,
        category: "clipboard",
        description: "Import browser history URLs from clipboard",
        tags: ["clipboard", "paste", "history"]
    }, function() {
        cb.read(function(response) {
            RUNTIME('addHistories', {history: response.data.split("\n")});
        });
    });
    } // end !Safari guard

    if (getBrowserName() === "Chrome") {
    mapkey(';ap', {
        short: "Apply proxy from clipboard",
        unique_id: "cmd_paste_proxy",
        feature_group: 13,
        category: "clipboard",
        description: "Apply proxy configuration from JSON in clipboard",
        tags: ["clipboard", "paste", "proxy"]
    }, function() {
        cb.read(function(response) {
            var proxyConf = JSON.parse(response.data) as { autoproxy_hosts: unknown; proxy: unknown; proxyMode: unknown };
            RUNTIME('updateProxy', {
                operation: 'set',
                host: proxyConf.autoproxy_hosts,
                proxy: proxyConf.proxy,
                mode: proxyConf.proxyMode
            });
        });
    });
    } // end Chrome guard
}
