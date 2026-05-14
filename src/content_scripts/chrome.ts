import {
    showPopup,
} from './common/utils.js';
import { dispatchSKEvent, runtime, RUNTIME } from './common/runtime.js';
import { start } from './content.js';
import { installErrorHandlers } from '../common/errorCollector.js';

// Install global error handlers for content script
installErrorHandlers('content_script');

function usePdfViewer() {
    window.location.replace(chrome.runtime.getURL("/pages/pdf_viewer.html") + "?file=" + encodeURIComponent(document.URL));
}

interface ReadTextOptions {
    enqueue?: boolean;
    voiceName?: string;
    verbose?: boolean;
    onEnd?: () => void;
}

function readText(text: string, options: ReadTextOptions) {
    options = options || {
        enqueue: true,
        voiceName: runtime.conf.defaultVoice
    };
    var verbose = options.verbose;
    var stopPattern = /[\s\u00a0]/g,
        verbose = options.verbose,
        onEnd = options.onEnd;
    delete options.verbose;
    delete options.onEnd;
    RUNTIME('read', {
        content: text,
        options: options
    }, function(res) {
        const r = res as { ttsEvent: { type: string; charIndex: number } };
        if (verbose) {
            if (r.ttsEvent.type === "start") {
                showPopup(text);
            } else if (r.ttsEvent.type === "word") {
                stopPattern.lastIndex = r.ttsEvent.charIndex;
                var updated, end = stopPattern.exec(text);
                if (end) {
                    updated = text.substr(0, r.ttsEvent.charIndex)
                        + "<font style='font-weight: bold; text-decoration: underline'>"
                        + text.substr(r.ttsEvent.charIndex, end.index - r.ttsEvent.charIndex + 1)
                        + "</font>"
                        + text.substr(end.index);
                } else {
                    updated = text.substr(0, r.ttsEvent.charIndex)
                        + "<font style='font-weight: bold; text-decoration: underline'>"
                        + text.substr(r.ttsEvent.charIndex)
                        + "</font>";
                }
                showPopup(updated);
            } else if (r.ttsEvent.type === "end") {
                dispatchSKEvent("front", ['hidePopup']);
            }
        }
        if (onEnd && (r.ttsEvent.type === "end" || r.ttsEvent.type === "interrupted")) {
            onEnd();
        }
        return r.ttsEvent.type !== "end";
    });
}

start({
    usePdfViewer,
    readText
});
