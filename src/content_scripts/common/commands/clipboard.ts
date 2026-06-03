import { RUNTIME, runtime } from '../runtime.js';
import { getBrowserName, showBanner, showImagePopup } from '../utils.js';
import type { CommandAPI } from '../../../../@types/surfingkeys';
import type { GKey } from '../g-keys.js';

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

function getFormData(form: HTMLFormElement, format?: string): Record<string, any> | string {
    var formData = new FormData(form);
    if (format === "json") {
        var obj: Record<string, any> = {};

        formData.forEach(function (value, key) {
            if (obj.hasOwnProperty(key)) {
                if ((value as string).length) {
                    var p = obj[key];
                    if (p.constructor.name === "Array") {
                        p.push(value);
                    } else {
                        obj[key] = [];
                        if (p.length) {
                            obj[key].push(p);
                        }
                        obj[key].push(value);
                    }
                }
            } else {
                obj[key] = value;
            }
        });

        return obj;
    } else {
        return new URLSearchParams(formData as any).toString();
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
    const { mapkey } = api;

    mapkey('yv', {
        short: "Yank text of element",
        unique_id: "cmd_yank_element_text",
        feature_group: 7,
        category: "clipboard",
        description: "Copy text content of a selected element to clipboard",
        tags: ["clipboard", "yank", "element"]
    }, function() {
        (hints as any).create(runtime.conf.textAnchorPat, function (element: any) {
            (clipboard as any).write(element[1] === 0 ? element[0].data.trim() : element[2].trim());
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
        (hints as any).create(runtime.conf.textAnchorPat, function (element: any) {
            textToYank.push(element[1] === 0 ? element[0].data.trim() : element[2].trim());
            (clipboard as any).write(textToYank.join('\n'));
        }, { multipleHits: true });
    });

    mapkey('g-032' satisfies GKey, {
        short: "Copy selected text",
        unique_id: "cmd_yank_selection",
        feature_group: 7,
        category: "clipboard",
        description: "Copy currently selected text to clipboard",
        tags: ["clipboard", "yank", "selection"]
    }, function() {
        const text = window.getSelection()?.toString() || '';
        if (text) {
            (clipboard as any).write(text);
        }
    });

    mapkey(';pp', {
        short: "Paste html on page",
        unique_id: "cmd_paste_html",
        feature_group: 7,
        category: "clipboard",
        description: "Replace current page content with HTML from clipboard",
        tags: ["clipboard", "paste", "html"]
    }, function() {
        (clipboard as any).read(function(response: any) {
            (document.documentElement as any).removeAttributes();
            (document.body as any).removeAttributes();
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
        (hints as any).create('*[href]', function(element: any) {
            (clipboard as any).write(element.href);
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
        (hints as any).create('*[href]', function(element: any) {
            linksToYank.push(element.href);
            (clipboard as any).write(linksToYank.join('\n'));
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
        (hints as any).create(getTableColumnHeads(), function(element: any) {
            var column = Array.from(element.closest("table").querySelectorAll("tr")).map(function(tr: any) {
                return tr.children.length > element.cellIndex ? tr.children[element.cellIndex].innerText : "";
            });
            (clipboard as any).write(column.join("\n"));
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
        (hints as any).create(getTableColumnHeads(), function(element: any) {
            var column = Array.from(element.closest("table").querySelectorAll("tr")).map(function(tr: any) {
                return tr.children.length > element.cellIndex ? tr.children[element.cellIndex].innerText : "";
            });
            if (!rows) {
                rows = column as string[];
            } else {
                (column as string[]).forEach(function(c, i) {
                    rows![i] += "\t" + c;
                });
            }
            (clipboard as any).write(rows!.join("\n"));
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
        (hints as any).create("pre", function(element: any) {
            (clipboard as any).write(element.innerText);
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
        (hints as any).create("input, textarea, select", function(element: any) {
            (clipboard as any).write(element.value);
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
        (clipboard as any).write((aa as any).outerHTML);
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
        }, function(response: any) {
            (clipboard as any).write(JSON.stringify(response.settings, null, 4));
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
        (clipboard as any).read(function(response: any) {
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
        if ((RUNTIME as any).repeats > 1) {
            const num = (RUNTIME as any).repeats;
            RUNTIME('getTabs', null, function (response: any) {
                const start = response.tabs.findIndex((t: any) => t.active);
                const range = response.tabs.slice(start, start + num);
                (clipboard as any).write(range.map((tab: any) => tab.url).join('\n'));
            });
            (RUNTIME as any).repeats = 1;
        } else {
            var url = window.location.href;
            if (url.indexOf(chrome.runtime.getURL("/pages/pdf_viewer.html")) === 0) {
                const filePos = window.location.search.indexOf("=") + 1;
                url = window.location.search.substr(filePos);
            }
            (clipboard as any).write(url);
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
        RUNTIME('getTabs', null, function (response: any) {
            (clipboard as any).write(response.tabs.map((tab: any) => tab.url).join('\n'));
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
        (clipboard as any).write(url.host);
    });
    mapkey('yl', {
        short: "Copy page title",
        unique_id: "cmd_yank_title",
        feature_group: 7,
        category: "clipboard",
        description: "Copy title of current page to clipboard",
        tags: ["clipboard", "yank", "title"]
    }, function() {
        (clipboard as any).write(document.title);
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
        }, function(response: any) {
            (clipboard as any).write(response.settings.OmniQueryHistory.join("\n"));
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
        var fd: Record<string, any> = {};
        document.querySelectorAll('form').forEach(function(form) {
            fd[generateFormKey(form)] = getFormData(form, "json");
        });
        (clipboard as any).write(JSON.stringify(fd, null, 4));
    });
    mapkey(';pf', {
        short: "Fill form from clipboard",
        unique_id: "cmd_paste_form",
        feature_group: 7,
        category: "clipboard",
        description: "Fill form fields with data from clipboard",
        tags: ["clipboard", "paste", "form"]
    }, function() {
        (hints as any).create('form', function(element: any, _event: any) {
            var formKey = generateFormKey(element);
            (clipboard as any).read(function(response: any) {
                var forms = JSON.parse(response.data.trim());
                if (forms.hasOwnProperty(formKey)) {
                    var fd = forms[formKey];
                    element.querySelectorAll('input, textarea').forEach(function(ip: any) {
                        if (fd.hasOwnProperty(ip.name) && ip.type !== "hidden") {
                            if (ip.type === "radio") {
                                var op = element.querySelector(`input[name='${ip.name}'][value='${fd[ip.name]}']`);
                                if (op) {
                                    op.checked = true;
                                }
                            } else if (Array.isArray(fd[ip.name])) {
                                element.querySelectorAll(`input[name='${ip.name}']`).forEach(function(ip: any) {
                                    ip.checked = false;
                                });
                                var vals = fd[ip.name];
                                vals.forEach(function(v: any) {
                                    var op = element.querySelector(`input[name='${ip.name}'][value='${v}']`);
                                    if (op) {
                                        op.checked = true;
                                    }
                                });
                            } else if (typeof(fd[ip.name]) === "string") {
                                ip.value = fd[ip.name];
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
        var aa: any[] = [];
        document.querySelectorAll('form').forEach(function(form) {
            var fd: Record<string, any> = {};
            fd[(form.method || "get") + "::" + form.action] = getFormData(form);
            aa.push(fd);
        });
        (clipboard as any).write(JSON.stringify(aa, null, 4));
    });

    mapkey('yg', {
        short: "Capture current page",
        unique_id: "cmd_yank_screenshot",
        feature_group: 7,
        category: "clipboard",
        description: "Capture screenshot of current page, show in popup with download and clipboard options",
        tags: ["clipboard", "screenshot", "capture"]
    }, function() {
        (front as any).toggleStatus(false);
        setTimeout(function() {
            RUNTIME('captureVisibleTab', null, function(response: any) {
                (front as any).toggleStatus(true);
                showImagePopup(response.dataUrl);
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
        }, function(response: any) {
            var items = response.downloads.map(function(o: any) {
                return o.url;
            });
            (clipboard as any).write(items.join(','));
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
        (clipboard as any).read(function(response: any) {
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
        (clipboard as any).read(function(response: any) {
            var proxyConf = JSON.parse(response.data);
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
