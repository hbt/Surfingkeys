type LogLevel = 'log' | 'warn' | 'error';

function LOG(level: LogLevel, msg: unknown) {
    // To turn on all levels: chrome.storage.local.set({"logLevels": ["log", "warn", "error"]})
    chrome.storage.local.get(["logLevels"], (r) => {
        const logLevels: string[] = (r && r.logLevels as string[]) || ["error"];
        if (["log", "warn", "error"].indexOf(level) !== -1 && logLevels.indexOf(level) !== -1) {
            (console as unknown as Record<string, (...args: unknown[]) => void>)[level](msg);
        }
    });
}

function regexFromString(str: string, caseSensitive: boolean, highlight: boolean) {
    var rxp: RegExp | null = null;
    const flags = caseSensitive ? "" : "i";
    str = str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
    if (highlight) {
        rxp = new RegExp(str.replace(/\s+/, "\|"), flags);
    } else {
        var words = str.split(/\s+/).map(function(w: string) {
            return `(?=.*${w})`;
        }).join('');
        rxp = new RegExp(`^${words}.*$`, flags);
    }
    return rxp;
}

export interface TitleUrlItem {
    title?: string;
    url?: string;
}

function filterByTitleOrUrl<T extends TitleUrlItem>(urls: T[], query: string, caseSensitive: boolean): T[];
function filterByTitleOrUrl(urls: unknown[] | unknown, query: string, caseSensitive: boolean): unknown[];
function filterByTitleOrUrl<T extends TitleUrlItem>(urls: T[] | unknown[] | unknown, query: string, caseSensitive: boolean): T[] | unknown[] {
    const urlsArr = (Array.isArray(urls) ? urls : []) as T[];
    if (query && query.length) {
        var rxp = regexFromString(query, caseSensitive, false);
        return urlsArr.filter(function(b: T) {
            const bAny = b as TitleUrlItem;
            return rxp!.test(bAny.title ?? '') || rxp!.test(bAny.url ?? '');
        });
    }
    return urlsArr;
}

export {
    LOG,
    filterByTitleOrUrl,
    regexFromString,
};
