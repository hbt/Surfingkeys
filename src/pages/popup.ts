export {};

declare global {
    interface String {
        format(...args: unknown[]): string;
    }
}

String.prototype.format = function(...args: unknown[]): string {
    let formatted: string = this as string;
    for (let i = 0; i < args.length; i++) {
        const regexp = new RegExp('\\{' + i + '\\}', 'gi');
        formatted = formatted.replace(regexp, String(args[i]));
    }
    return formatted;
};

// Restore focus hack: focus input to steal focus from address bar/DevTools
// Then close popup and trigger tab switch hack
(function restoreFocusHack() {
    window.focus();
    document.body.focus();
    var input = document.getElementById('restoreFocusInput');
    if (input) input.focus();

    // Close popup and trigger tab switch hack after brief delay
    setTimeout(function() {
        window.close();
    }, 50);

    // Send message to background for tab switch hack
    chrome.runtime.sendMessage({ action: 'restoreFocusHack' });
})();

var disableAll = document.getElementById('disableAll'),
    version = "Surfingkeys " + chrome.runtime.getManifest().version;

function RUNTIME(action: string, args: Record<string, unknown>, callback?: (response: unknown) => void) {
    (args = args || {}).action = action;
    args['needResponse'] = callback !== undefined;
    if (callback !== undefined) {
        chrome.runtime.sendMessage(args, callback);
    } else {
        chrome.runtime.sendMessage(args);
    }
}

function updateStatus(blocklist: Record<string, unknown>) {
    var disabled = blocklist.hasOwnProperty('.*');
    if (disableAll) {
        disableAll.textContent = (disabled ? 'Enable ' : 'Disable ') + version;
    }
    RUNTIME('setSurfingkeysIcon', {
        status: disabled
    });
}

RUNTIME('getSettings', {
    key: 'blocklist'
}, function(response) {
    updateStatus((response as { settings: { blocklist: Record<string, unknown> } }).settings.blocklist);
});

if (disableAll) {
    disableAll.addEventListener('click', function() {
        RUNTIME('toggleBlocklist', {
            domain: ".*"
        }, function(response) {
            updateStatus((response as { blocklist: Record<string, unknown> }).blocklist);
        });
    });
}

document.getElementById('reportIssue')?.addEventListener('click', function () {
    window.close();
    var description = "%23%23+Error+details%0A%0A{0}%0A%0ASurfingKeys%3A+{1}%0A%0ABrowser%3A+{2}%0A%0AURL%3A+{3}%0A%0A%23%23+Context%0A%0A%2A%2APlease+replace+this+with+a+description+of+how+you+were+using+SurfingKeys.%2A%2A".format(encodeURIComponent(""), chrome.runtime.getManifest().version, encodeURIComponent(navigator.userAgent), encodeURIComponent("<The_URL_Where_You_Find_The_Issue>"));
    window.open("https://github.com/brookhong/Surfingkeys/issues/new?title={0}&body={1}".format(encodeURIComponent(""), description));
});
