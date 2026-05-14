import { runtime } from './common/runtime.js';
import KeyboardUtils from './common/keyboardUtils';
import {
    createElementWithContent,
    htmlEncode,
    httpRequest,
    setSanitizedContent,
} from './common/utils.js';
import { marked } from 'marked';
import type { ClipboardResponse } from '../../@types/surfingkeys';

interface HttpResponse {
    text: string;
}

document.addEventListener("surfingkeys:defaultSettingsLoaded", function(evt) {
    const { normal, api } = (evt as CustomEvent).detail;
    const {
        mapkey,
        Clipboard,
        Front,
    } = api as {
        mapkey: (key: string, annotation: Record<string, unknown>, fn: () => void) => void;
        Clipboard: { read: (cb: (r: ClipboardResponse) => void) => void; write: (t: string) => void };
        Front: { showEditor: (src: string, cb: (s: string) => void, mode: string) => void };
    };

    var desc: Element | null, content: Element | null;

    mapkey(';h', {
        short: 'Toggle section',
        unique_id: 'cmd_markdown_toggle_section',
        category: 'Markdown',
        description: 'Toggle the header description panel in the markdown viewer',
        tags: ['markdown'],
        feature_group: 99,
    }, function() {
        if (!desc || !content) return;
        if ((desc as HTMLElement).style.display !== "none") {
            (content as HTMLElement).style.height = "100vh";
            (desc as HTMLElement).style.display = "none";
        } else {
            (desc as HTMLElement).style.display = "";
            (content as HTMLElement).style.height = (window.innerHeight - (desc as HTMLElement).offsetHeight) + "px";
        }
    });

    function renderHeaderDescription() {
        var words = (normal.mappings.getWords() as string[]).map(function(w: string) {
            var meta = normal.mappings.find(w).meta as Record<string, unknown>;
            w = KeyboardUtils.decodeKeystroke(w);
            if (meta.feature_group === 99) {
                var annotText = typeof meta.annotation === 'object' && meta.annotation !== null
                    ? (meta.annotation as Record<string, unknown>).short
                    : (Array.isArray(meta.annotation) ? (meta.annotation as string[])[0] : meta.annotation);
                if (!annotText) return null;
                return `<div><span class=kbd-span><kbd>${htmlEncode(w)}</kbd></span><span class=annotation>${annotText}</span></div>`;
            }
            return null;
        }).filter(function(w: string | null) {
            return w !== null;
        });

        desc = document.querySelector('div.description');
        if (desc) {
            desc.remove();
        }
        content = document.querySelector('div.content');
        desc = createElementWithContent('div', words.join(""), {class: "description"});
        document.body.insertBefore(desc, content);
        (content as HTMLElement).style.height = (window.innerHeight - (desc as HTMLElement).offsetHeight) + "px";
    }

    var markdownBody = document.querySelector(".markdown-body"), _source: string;

    function previewMarkdown(mk: string) {
        _source = mk;
        if (runtime.conf.useLocalMarkdownAPI) {
            setSanitizedContent(markdownBody, marked.parse(mk));
        } else {
            setSanitizedContent(markdownBody, "Loading preview…");
            httpRequest({
                url: "https://api.github.com/markdown/raw",
                data: mk
            }, function(res: Record<string, unknown>) {
                setSanitizedContent(markdownBody, (res as unknown as HttpResponse).text);
            });
        }
    }

    mapkey('sm', {
        short: 'Edit markdown source',
        unique_id: 'cmd_markdown_edit_source',
        category: 'Markdown',
        description: 'Open the markdown source in a vim editor for editing',
        tags: ['markdown', 'editor'],
        feature_group: 99,
    }, function() {
        Front.showEditor(_source, previewMarkdown, 'markdown');
    });

    mapkey(';s', {
        short: 'Switch markdown parser',
        unique_id: 'cmd_markdown_switch_parser',
        category: 'Markdown',
        description: 'Toggle between local and GitHub API markdown rendering',
        tags: ['markdown'],
        feature_group: 99,
    }, function() {
        runtime.conf.useLocalMarkdownAPI = !runtime.conf.useLocalMarkdownAPI;
        previewMarkdown(_source);
    });

    mapkey('cc', {
        short: 'Copy generated HTML',
        unique_id: 'cmd_markdown_copy_html',
        category: 'Markdown',
        description: 'Copy the generated HTML code from the markdown preview to clipboard',
        tags: ['markdown', 'clipboard'],
        feature_group: 99,
    }, function() {
        Clipboard.write(markdownBody!.innerHTML);
    });

    var mdUrl = window.location.search.substr(3);

    if (mdUrl !== "") {
        httpRequest({
            url: mdUrl
        }, function(res: Record<string, unknown>) {
            previewMarkdown((res as unknown as HttpResponse).text);
        });
    } else {
        Clipboard.read(function(response: ClipboardResponse) {
            previewMarkdown(response.data);
        });
    }

    var reader = new FileReader(), inputFile: File;
    reader.onload = function(){
        previewMarkdown(reader.result as string);
    };
    function previewMarkdownFile() {
        reader.readAsText(inputFile);
    }
    var inputFileDiv = document.querySelector("input[type=file]") as HTMLInputElement | null;
    if (inputFileDiv) {
        inputFileDiv.onchange = function(evt: Event) {
            const target = evt.target as HTMLInputElement;
            if (target.files && target.files[0]) {
                inputFile = target.files[0];
                previewMarkdownFile();
            }
        };
    }

    mapkey('of', {
        short: 'Open local file',
        unique_id: 'cmd_markdown_open_file',
        category: 'Markdown',
        description: 'Open a local markdown file for preview',
        tags: ['markdown', 'file'],
        feature_group: 99,
    }, function() {
        inputFileDiv?.click();
    });

    renderHeaderDescription();
});
