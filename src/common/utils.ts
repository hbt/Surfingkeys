function LOG(level: any, msg: any) {
    // To turn on all levels: chrome.storage.local.set({"logLevels": ["log", "warn", "error"]})
    chrome.storage.local.get(["logLevels"], (r) => {
        const logLevels = r && r.logLevels || ["error"];
        if (["log", "warn", "error"].indexOf(level) !== -1 && (logLevels as any[]).indexOf(level) !== -1) {
            (console as any)[level](msg);
        }
    });
}

function regexFromString(str: any, caseSensitive: any, highlight: any) {
    var rxp: RegExp | null = null;
    const flags = caseSensitive ? "" : "i";
    str = str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
    if (highlight) {
        rxp = new RegExp(str.replace(/\s+/, "\|"), flags);
    } else {
        var words = str.split(/\s+/).map(function(w: any) {
            return `(?=.*${w})`;
        }).join('');
        rxp = new RegExp(`^${words}.*$`, flags);
    }
    return rxp;
}

function filterByTitleOrUrl(urls: any, query: any, caseSensitive: any) {
    if (query && query.length) {
        var rxp = regexFromString(query, caseSensitive, false);
        urls = urls.filter(function(b: any) {
            return rxp!.test(b.title) || rxp!.test(b.url);
        });
    }
    return urls;
}

export {
    LOG,
    filterByTitleOrUrl,
    regexFromString,
};
