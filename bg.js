console.sassert = function (cond, text) {
    if (cond) return;
    if (console.assert.useDebugger) debugger;
    throw new Error(text || "Assertion failed!");
};

const uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

{
    var Clipboard = {};

    Clipboard.createTextArea = function () {
        var t = document.createElement("textarea");
        t.style.position = "absolute";
        t.style.left = "-100%";
        return t;
    };

    Clipboard.copy = function (text) {
        var t = this.createTextArea();
        t.value = text;
        document.body.appendChild(t);
        t.select();
        document.execCommand("Copy");
        document.body.removeChild(t);
    };

    Clipboard.paste = function () {
        var t = this.createTextArea();
        document.body.appendChild(t);
        t.focus();
        document.execCommand("Paste");
        var text = t.value;
        document.body.removeChild(t);
        return text;
    };
}

{
    var Utils = {
        getHostname: function (href) {
            var res = window.location.host || "file";

            if (href) {
                var a = document.createElement("a");
                a.href = href;
                res = a.host;
            }

            return res;
        },
        defaultSearchEngine: "https://www.google.com/search?q=",
        format: function (string, value) {
            var index = string.lastIndexOf("%s");
            if (index < 0) return string + value;
            return string.slice(0, index) + value + string.slice(index + 2);
        },
        toSearchURL: function (query, engineUrl) {
            if (Utils.isValidURL(query)) {
                return (!/^[a-zA-Z\-]+:/.test(query) ? "http://" : "") + query;
            }
            engineUrl = engineUrl || Utils.defaultSearchEngine;
            return Utils.format(engineUrl, encodeURIComponent(query));
        },

        isValidURL: (function () {
            var TLDs = [
                "abogado",
                "ac",
                "academy",
                "accountants",
                "active",
                "actor",
                "ad",
                "adult",
                "ae",
                "aero",
                "af",
                "ag",
                "agency",
                "ai",
                "airforce",
                "al",
                "allfinanz",
                "alsace",
                "am",
                "amsterdam",
                "an",
                "android",
                "ao",
                "aq",
                "aquarelle",
                "ar",
                "archi",
                "army",
                "arpa",
                "as",
                "asia",
                "associates",
                "at",
                "attorney",
                "au",
                "auction",
                "audio",
                "autos",
                "aw",
                "ax",
                "axa",
                "az",
                "ba",
                "band",
                "bank",
                "bar",
                "barclaycard",
                "barclays",
                "bargains",
                "bayern",
                "bb",
                "bd",
                "be",
                "beer",
                "berlin",
                "best",
                "bf",
                "bg",
                "bh",
                "bi",
                "bid",
                "bike",
                "bio",
                "biz",
                "bj",
                "black",
                "blackfriday",
                "bloomberg",
                "blue",
                "bm",
                "bmw",
                "bn",
                "bnpparibas",
                "bo",
                "boo",
                "boutique",
                "br",
                "brussels",
                "bs",
                "bt",
                "budapest",
                "build",
                "builders",
                "business",
                "buzz",
                "bv",
                "bw",
                "by",
                "bz",
                "bzh",
                "ca",
                "cab",
                "cal",
                "camera",
                "camp",
                "cancerresearch",
                "capetown",
                "capital",
                "caravan",
                "cards",
                "care",
                "career",
                "careers",
                "cartier",
                "casa",
                "cash",
                "cat",
                "catering",
                "cc",
                "cd",
                "center",
                "ceo",
                "cern",
                "cf",
                "cg",
                "ch",
                "channel",
                "cheap",
                "christmas",
                "chrome",
                "church",
                "ci",
                "citic",
                "city",
                "ck",
                "cl",
                "claims",
                "cleaning",
                "click",
                "clinic",
                "clothing",
                "club",
                "cm",
                "cn",
                "co",
                "coach",
                "codes",
                "coffee",
                "college",
                "cologne",
                "com",
                "community",
                "company",
                "computer",
                "condos",
                "construction",
                "consulting",
                "contractors",
                "cooking",
                "cool",
                "coop",
                "country",
                "cr",
                "credit",
                "creditcard",
                "cricket",
                "crs",
                "cruises",
                "cu",
                "cuisinella",
                "cv",
                "cw",
                "cx",
                "cy",
                "cymru",
                "cz",
                "dabur",
                "dad",
                "dance",
                "dating",
                "day",
                "dclk",
                "de",
                "deals",
                "degree",
                "delivery",
                "democrat",
                "dental",
                "dentist",
                "desi",
                "design",
                "dev",
                "diamonds",
                "diet",
                "digital",
                "direct",
                "directory",
                "discount",
                "dj",
                "dk",
                "dm",
                "dnp",
                "do",
                "docs",
                "domains",
                "doosan",
                "durban",
                "dvag",
                "dz",
                "eat",
                "ec",
                "edu",
                "education",
                "ee",
                "eg",
                "email",
                "emerck",
                "energy",
                "engineer",
                "engineering",
                "enterprises",
                "equipment",
                "er",
                "es",
                "esq",
                "estate",
                "et",
                "eu",
                "eurovision",
                "eus",
                "events",
                "everbank",
                "exchange",
                "expert",
                "exposed",
                "fail",
                "farm",
                "fashion",
                "feedback",
                "fi",
                "finance",
                "financial",
                "firmdale",
                "fish",
                "fishing",
                "fit",
                "fitness",
                "fj",
                "fk",
                "flights",
                "florist",
                "flowers",
                "flsmidth",
                "fly",
                "fm",
                "fo",
                "foo",
                "forsale",
                "foundation",
                "fr",
                "frl",
                "frogans",
                "fund",
                "furniture",
                "futbol",
                "ga",
                "gal",
                "gallery",
                "garden",
                "gb",
                "gbiz",
                "gd",
                "ge",
                "gent",
                "gf",
                "gg",
                "ggee",
                "gh",
                "gi",
                "gift",
                "gifts",
                "gives",
                "gl",
                "glass",
                "gle",
                "global",
                "globo",
                "gm",
                "gmail",
                "gmo",
                "gmx",
                "gn",
                "goog",
                "google",
                "gop",
                "gov",
                "gp",
                "gq",
                "gr",
                "graphics",
                "gratis",
                "green",
                "gripe",
                "gs",
                "gt",
                "gu",
                "guide",
                "guitars",
                "guru",
                "gw",
                "gy",
                "hamburg",
                "hangout",
                "haus",
                "healthcare",
                "help",
                "here",
                "hermes",
                "hiphop",
                "hiv",
                "hk",
                "hm",
                "hn",
                "holdings",
                "holiday",
                "homes",
                "horse",
                "host",
                "hosting",
                "house",
                "how",
                "hr",
                "ht",
                "hu",
                "ibm",
                "id",
                "ie",
                "ifm",
                "il",
                "im",
                "immo",
                "immobilien",
                "in",
                "industries",
                "info",
                "ing",
                "ink",
                "institute",
                "insure",
                "int",
                "international",
                "investments",
                "io",
                "iq",
                "ir",
                "irish",
                "is",
                "it",
                "iwc",
                "jcb",
                "je",
                "jetzt",
                "jm",
                "jo",
                "jobs",
                "joburg",
                "jp",
                "juegos",
                "kaufen",
                "kddi",
                "ke",
                "kg",
                "kh",
                "ki",
                "kim",
                "kitchen",
                "kiwi",
                "km",
                "kn",
                "koeln",
                "kp",
                "kr",
                "krd",
                "kred",
                "kw",
                "ky",
                "kyoto",
                "kz",
                "la",
                "lacaixa",
                "land",
                "lat",
                "latrobe",
                "lawyer",
                "lb",
                "lc",
                "lds",
                "lease",
                "legal",
                "lgbt",
                "li",
                "lidl",
                "life",
                "lighting",
                "limited",
                "limo",
                "link",
                "lk",
                "loans",
                "london",
                "lotte",
                "lotto",
                "lr",
                "ls",
                "lt",
                "ltda",
                "lu",
                "luxe",
                "luxury",
                "lv",
                "ly",
                "ma",
                "madrid",
                "maison",
                "management",
                "mango",
                "market",
                "marketing",
                "marriott",
                "mc",
                "md",
                "me",
                "media",
                "meet",
                "melbourne",
                "meme",
                "memorial",
                "menu",
                "mg",
                "mh",
                "miami",
                "mil",
                "mini",
                "mk",
                "ml",
                "mm",
                "mn",
                "mo",
                "mobi",
                "moda",
                "moe",
                "monash",
                "money",
                "mormon",
                "mortgage",
                "moscow",
                "motorcycles",
                "mov",
                "mp",
                "mq",
                "mr",
                "ms",
                "mt",
                "mu",
                "museum",
                "mv",
                "mw",
                "mx",
                "my",
                "mz",
                "na",
                "nagoya",
                "name",
                "navy",
                "nc",
                "ne",
                "net",
                "network",
                "neustar",
                "new",
                "nexus",
                "nf",
                "ng",
                "ngo",
                "nhk",
                "ni",
                "ninja",
                "nl",
                "no",
                "np",
                "nr",
                "nra",
                "nrw",
                "nu",
                "nyc",
                "nz",
                "okinawa",
                "om",
                "one",
                "ong",
                "onl",
                "ooo",
                "org",
                "organic",
                "osaka",
                "otsuka",
                "ovh",
                "pa",
                "paris",
                "partners",
                "parts",
                "party",
                "pe",
                "pf",
                "pg",
                "ph",
                "pharmacy",
                "photo",
                "photography",
                "photos",
                "physio",
                "pics",
                "pictures",
                "pink",
                "pizza",
                "pk",
                "pl",
                "place",
                "plumbing",
                "pm",
                "pn",
                "pohl",
                "poker",
                "porn",
                "post",
                "pr",
                "praxi",
                "press",
                "pro",
                "prod",
                "productions",
                "prof",
                "properties",
                "property",
                "ps",
                "pt",
                "pub",
                "pw",
                "py",
                "qa",
                "qpon",
                "quebec",
                "re",
                "realtor",
                "recipes",
                "red",
                "rehab",
                "reise",
                "reisen",
                "reit",
                "ren",
                "rentals",
                "repair",
                "report",
                "republican",
                "rest",
                "restaurant",
                "reviews",
                "rich",
                "rio",
                "rip",
                "ro",
                "rocks",
                "rodeo",
                "rs",
                "rsvp",
                "ru",
                "ruhr",
                "rw",
                "ryukyu",
                "sa",
                "saarland",
                "sale",
                "samsung",
                "sarl",
                "sb",
                "sc",
                "sca",
                "scb",
                "schmidt",
                "schule",
                "schwarz",
                "science",
                "scot",
                "sd",
                "se",
                "services",
                "sew",
                "sexy",
                "sg",
                "sh",
                "shiksha",
                "shoes",
                "shriram",
                "si",
                "singles",
                "sj",
                "sk",
                "sky",
                "sl",
                "sm",
                "sn",
                "so",
                "social",
                "software",
                "sohu",
                "solar",
                "solutions",
                "soy",
                "space",
                "spiegel",
                "sr",
                "st",
                "su",
                "supplies",
                "supply",
                "support",
                "surf",
                "surgery",
                "suzuki",
                "sv",
                "sx",
                "sy",
                "sydney",
                "systems",
                "sz",
                "taipei",
                "tatar",
                "tattoo",
                "tax",
                "tc",
                "td",
                "technology",
                "tel",
                "temasek",
                "tf",
                "tg",
                "th",
                "tienda",
                "tips",
                "tires",
                "tirol",
                "tj",
                "tk",
                "tl",
                "tm",
                "tn",
                "to",
                "today",
                "tokyo",
                "tools",
                "top",
                "town",
                "toys",
                "tp",
                "tr",
                "trade",
                "training",
                "travel",
                "trust",
                "tt",
                "tui",
                "tv",
                "tw",
                "tz",
                "ua",
                "ug",
                "uk",
                "university",
                "uno",
                "uol",
                "us",
                "uy",
                "uz",
                "va",
                "vacations",
                "vc",
                "ve",
                "vegas",
                "ventures",
                "versicherung",
                "vet",
                "vg",
                "vi",
                "viajes",
                "video",
                "villas",
                "vision",
                "vlaanderen",
                "vn",
                "vodka",
                "vote",
                "voting",
                "voto",
                "voyage",
                "vu",
                "wales",
                "wang",
                "watch",
                "webcam",
                "website",
                "wed",
                "wedding",
                "wf",
                "whoswho",
                "wien",
                "wiki",
                "williamhill",
                "wme",
                "work",
                "works",
                "world",
                "ws",
                "wtc",
                "wtf",
                "xn--1qqw23a",
                "xn--3bst00m",
                "xn--3ds443g",
                "xn--3e0b707e",
                "xn--45brj9c",
                "xn--45q11c",
                "xn--4gbrim",
                "xn--55qw42g",
                "xn--55qx5d",
                "xn--6frz82g",
                "xn--6qq986b3xl",
                "xn--80adxhks",
                "xn--80ao21a",
                "xn--80asehdb",
                "xn--80aswg",
                "xn--90a3ac",
                "xn--b4w605ferd",
                "xn--c1avg",
                "xn--cg4bki",
                "xn--clchc0ea0b2g2a9gcd",
                "xn--czr694b",
                "xn--czrs0t",
                "xn--czru2d",
                "xn--d1acj3b",
                "xn--d1alf",
                "xn--fiq228c5hs",
                "xn--fiq64b",
                "xn--fiqs8s",
                "xn--fiqz9s",
                "xn--flw351e",
                "xn--fpcrj9c3d",
                "xn--fzc2c9e2c",
                "xn--gecrj9c",
                "xn--h2brj9c",
                "xn--hxt814e",
                "xn--i1b6b1a6a2e",
                "xn--io0a7i",
                "xn--j1amh",
                "xn--j6w193g",
                "xn--kprw13d",
                "xn--kpry57d",
                "xn--kput3i",
                "xn--l1acc",
                "xn--lgbbat1ad8j",
                "xn--mgb9awbf",
                "xn--mgba3a4f16a",
                "xn--mgbaam7a8h",
                "xn--mgbab2bd",
                "xn--mgbayh7gpa",
                "xn--mgbbh1a71e",
                "xn--mgbc0a9azcg",
                "xn--mgberp4a5d4ar",
                "xn--mgbx4cd0ab",
                "xn--ngbc5azd",
                "xn--node",
                "xn--nqv7f",
                "xn--nqv7fs00ema",
                "xn--o3cw4h",
                "xn--ogbpf8fl",
                "xn--p1acf",
                "xn--p1ai",
                "xn--pgbs0dh",
                "xn--q9jyb4c",
                "xn--qcka1pmc",
                "xn--rhqv96g",
                "xn--s9brj9c",
                "xn--ses554g",
                "xn--unup4y",
                "xn--vermgensberater-ctb",
                "xn--vermgensberatung-pwb",
                "xn--vhquv",
                "xn--wgbh1c",
                "xn--wgbl6a",
                "xn--xhq521b",
                "xn--xkc2al3hye2a",
                "xn--xkc2dl3a5ee0h",
                "xn--yfro4i67o",
                "xn--ygbi2ammx",
                "xn--zfr164b",
                "xxx",
                "xyz",
                "yachts",
                "yandex",
                "ye",
                "yoga",
                "yokohama",
                "youtube",
                "yt",
                "za",
                "zip",
                "zm",
                "zone",
                "zuerich",
                "zw",
            ];
            var PROTOCOLS = ["http:", "https:", "file:", "ftp:", "chrome:", "chrome-extension:"];
            return function (url) {
                url = url.trim();
                if (~url.indexOf(" ")) return false;
                if (~url.search(/^(about|file):[^:]/)) return true;
                var protocol = (url.match(/^([a-zA-Z\-]+:)[^:]/) || [""])[0].slice(0, -1);
                var protocolMatch = PROTOCOLS.indexOf(protocol) !== -1;
                if (protocolMatch) url = url.replace(/^[a-zA-Z\-]+:\/*/, "");
                var hasPath = /.*[a-zA-Z].*\//.test(url);
                url = url.replace(/(:[0-9]+)?([#\/].*|$)/g, "").split(".");
                if (protocolMatch && /^[a-zA-Z0-9@!]+$/.test(url)) return true;
                if (protocol && !protocolMatch && protocol !== "localhost:") return false;
                var isIP = url.every(function (e) {
                    // IP addresses
                    return /^[0-9]+$/.test(e) && +e >= 0 && +e < 256;
                });
                if ((isIP && !protocol && url.length === 4) || (isIP && protocolMatch)) return true;
                return (
                    (url.every(function (e) {
                        return /^[a-z0-9\-]+$/i.test(e);
                    }) &&
                        url.length > 1 &&
                        TLDs.indexOf(url[url.length - 1]) !== -1) ||
                    (url.length === 1 && url[0] === "localhost") ||
                    hasPath
                );
            };
        })(),
    };
}

var State = {
    tabsMarked: new Map(),
    tabsQuickMarks: new Map(),
    tabsSettings: new Map(),
    tabUrls: new Map(),
    // Note(hbt) tracks openerTabId because the id is lost when the tab is moved
    tabOpenerIds: new Map(),
    tabsRemoved: [],
    // globalSettings: {
    //     focusAfterClosed: "right",
    //     repeatThreshold: 99,
    //     tabsMRUOrder: true,
    //     newTabPosition: 'default',
    //     showTabIndices: false,
    //     interceptedErrors: []
    // }
};

// https://github.com/deanoemcke/thegreatsuspender
// https://github.com/deanoemcke/thegreatsuspender/issues/276#issuecomment-448164831
var Constants = {
    tabSuspenderExtensionID: "icpcohpmccndpdnpbeglkengjkgegcjb",
};

class CustomBackground {
    init() {
        this.registerListeners();
    }

    registerListeners() {
        chrome.runtime.onMessage.addListener((_message, _sender, _sendResponse, _port) => {
            this.handlePortMessage(_message, _sender, _sendResponse, _port);
        });

        chrome.runtime.onConnect.addListener((port) => {
            var sender = port.sender;
            port.onMessage.addListener((message, port) => {
                return this.handlePortMessage(
                    message,
                    port.sender,
                    function (resp) {
                        try {
                            if (!port.isDisconnected) {
                                port.postMessage(resp);
                            }
                        } catch (e) {
                            console.error(message.action + ": " + e);
                            console.error(port, e);
                        }
                    },
                    port
                );
            });
        });

        chrome.commands.onCommand.addListener(function (command) {
            switch (command) {
                case "handlebothcwevents":
                    CustomBackground.handleCtrlWFeature();
                    break;
                case "reloaddark":
                    chrome.management.setEnabled("pdhanilkeidkjjnhipibaemjgnndkiep", false);
                    chrome.management.setEnabled("pdhanilkeidkjjnhipibaemjgnndkiep", true);
                    break;
            }
        });

        chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
            CustomBackground.pageStylesheetLoadByDomain(changeInfo, tab);
            CustomBackground.tabSendMessageOnWhenDoneLoading(changeInfo, tab);
            CustomBackground.tabUpdateInternalState(tab);
            CustomBackground.tabsMuteByDomain(tab, changeInfo);
        });

        chrome.tabs.onCreated.addListener(function (tab) {
            CustomBackground.tabsOnCreatedHandler(tab);
        });

        chrome.tabs.onRemoved.addListener(function (tab) {
            CustomBackground.tabsOnRemovedSave(tab);
        });
    }

    static async tabUpdateInternalState(tab) {
        State.tabUrls.set(tab.id, tab);
    }

    static async tabsOnRemovedSave(tabId) {
        State.tabsRemoved.push(tabId);
    }

    async tabUnmute(message, sender, sendResponse) {
        const ctab = await chrome.tabs.get(sender.tab.id);
        chrome.tabs.update(ctab.id, {
            muted: false,
        });
    }

    static async tabsMuteByDomain(tab, changeInfo) {
        // Note(hbt) for now mute all tabs and unmute in config file

        if (changeInfo.status === "loading") {
            chrome.tabs.update(tab.id, {
                muted: true,
            });
            return;
        }
    }

    /**
     * open on the right even when clicking with the mouse instead of using hints
     *
     * @param tab
     * @returns {Promise<void>}
     */
    static async tabsOnCreatedHandler(tab) {
        if (tab.openerTabId) {
            State.tabOpenerIds.set(tab.id, tab.openerTabId);
            const otab = await chrome.tabs.get(tab.openerTabId);
            if (State.tabsSettings.has(otab.id)) {
                if (State.tabsSettings.get(otab.id).newTabPosition === "right") {
                    chrome.tabs.get(tab.openerTabId, (ot) => {
                        chrome.tabs.move(tab.id, {
                            index: ot.index + 1,
                        });
                    });
                }
            }
        }
    }

    sendResponse(message, sendResponse, result) {
        result.action = message.action;
        result.id = message.id;
        sendResponse(result);
    }

    handlePortMessage(_message, _sender, _sendResponse, _port) {
        if (_message && _message.target !== "content_runtime") {
            if (this[_message.action] instanceof Function) {
                try {
                    this[_message.action](_message, _sender, _sendResponse);
                } catch (e) {
                    console.log(_message.action + ": " + e);
                    console.error(e);
                }
            }
        }
    }

    async updateSettings(message, sender, sendResponse) {
        this.updateMySettings(message, sender, sendResponse);
    }

    async updateMySettings(message, sender, sendResponse) {
        State.tabsSettings.set(sender.tab.id, message.settings);
    }

    async insertOpenExternalEditor(message, sender, sendResponse) {
        var xhr = new XMLHttpRequest();
        xhr.open("POST", "http://127.0.0.1:8001");
        xhr.onreadystatechange = () => {
            if (xhr.readyState === 4 && xhr.status === 200) {
                this.sendResponse(message, sendResponse, {
                    type: "editWithVIMCallback",
                    text: xhr.responseText,
                    elementId: message.elementId,
                });
            }
        };
        xhr.send(
            JSON.stringify({
                data: "" + (message.text || ""),
                line: message.line || 0,
                column: message.column || 0,
            })
        );
    }

    /**
     * WIP
     *
     * @param message
     * @param sender
     * @param sendResponse
     * @returns {Promise<void>}
     */
    async tabToggleSwitchTabNewPosition(message, sender, sendResponse) {
        // Note(hbt) skipping idea for now. low ROI

        // Note(hbt) only works when using mouse.
        // TODO(hbt) ENHANCE handle openLink when using hint mode

        let settings = State.tabsSettings.get(sender.tab.id);
        if (settings.newTabPosition === "right") {
            settings.newTabPosition = "default";
        } else {
            settings.newTabPosition = "right";
        }
        State.tabsSettings.set(sender.tab.id, settings);
    }

    testMyPort(_message, _sender, _sendResponse) {
        this.sendResponse(_message, _sendResponse, { test: "works" });
    }

    async copyTopURL(_message, _sender, _sendResponse) {
        const ctab = await chrome.tabs.get(_sender.tab.id);
        let url = ctab.url;
        Clipboard.copy(url);
        this.sendResponse(_message, _sendResponse, { url: url });
    }

    async openLinkNewWindow(_message, _sender, _sendResponse) {
        const ctab = await chrome.tabs.get(_sender.tab.id);
        const win = await chrome.windows.get(ctab.windowId);

        chrome.windows.create({
            url: _message.url,
            focused: true,
            incognito: win.incognito,
            state: "maximized",
        });
    }

    openLinkIncognito(_message, _sender, _sendResponse) {
        chrome.windows.create({
            url: _message.url,
            focused: true,
            incognito: true,
            state: "maximized",
        });
    }

    async pasteFromClipboard(_message, _sender, _sendResponse) {
        const ctab = await chrome.tabs.get(_sender.tab.id);
        var paste = Clipboard.paste();
        if (!paste) {
            return;
        }
        paste = paste.split("\n")[0];
        let url = Utils.toSearchURL(paste, Utils.defaultSearchEngine);
        await this.openLinkCurrentOrIncognito(url, ctab);
    }

    async pasteFromClipboardNewTab(_message, _sender, _sendResponse) {
        let that = this;

        async function openNormalURLsInCurrentWindow(urls, ctab) {
            if (urls.length === 0) {
                return;
            }
            for (let url of urls) {
                await chrome.tabs.create({
                    url: url,
                    index: ctab.index + 1,
                });
            }
        }

        async function openIncognitoURLsInNewIncognitoWindow(urls) {
            if (urls.length === 0) {
                return;
            }

            await chrome.windows.create({
                url: urls,
                focused: true,
                incognito: true,
                state: "maximized",
            });
        }

        async function separateNormalURLsFromIncognitoURLs(urls) {
            let map = {
                normal: [],
                incognito: [],
            };
            for (let url of urls) {
                if (await that._isBookmarkedUrl(url, CustomCommonConfig.incognitoBookmarkFolder)) {
                    map.incognito.push(url);
                } else {
                    map.normal.push(url);
                }
            }

            return map;
        }

        const ctab = await chrome.tabs.get(_sender.tab.id);
        var paste = Clipboard.paste();
        if (!paste) {
            return;
        }
        paste = paste.split("\n").filter(function (e) {
            return e.trim();
        });

        let repeats = _message.repeats > 0 ? _message.repeats : paste.length;
        paste = paste.slice(0, repeats);
        let urls = paste.map((v) => {
            return Utils.toSearchURL(v.trim(), Utils.defaultSearchEngine);
        });

        if (ctab.incognito) {
            await openNormalURLsInCurrentWindow(urls, ctab);
        } else {
            let urlsMap = await separateNormalURLsFromIncognitoURLs(urls);

            await openNormalURLsInCurrentWindow(urlsMap.normal, ctab);
            await openIncognitoURLsInNewIncognitoWindow(urlsMap.incognito);
        }
    }

    async openLinkCurrentOrIncognito(url, ctab) {
        let isURLFlaggedAsIncognito = await this._isBookmarkedUrl(url, CustomCommonConfig.incognitoBookmarkFolder);
        if (isURLFlaggedAsIncognito && !ctab.incognito) {
            await chrome.windows.create({
                url: url,
                focused: true,
                incognito: true,
                state: "maximized",
            });
        } else {
            await chrome.tabs.update({
                url: url,
            });
        }
    }

    static async handleCtrlWFeature() {
        const w = await chrome.windows.getCurrent();
        const tab = await chrome.tabs.getSelected(w.id);

        chrome.tabs.sendMessage(tab.id, {
            action: "handleCtrlWFeature",
        });
    }

    async tabUnique(_message, _sender, _sendResponse) {
        async function getAllTabsInCurrentWindow() {
            const window = await chrome.windows.getCurrent();
            const tabs = await chrome.tabs.query({ windowId: window.id });
            return tabs;
        }

        async function removeDuplicateTabsByURL(tabs, uniqueTabs) {
            let diffIds = _.difference(
                tabs.map((t) => {
                    return t.id;
                }),
                uniqueTabs.map((t) => {
                    return t.id;
                })
            );
            if (diffIds) await chrome.tabs.remove(diffIds);
        }

        const tabs = await getAllTabsInCurrentWindow();
        const uniqueTabs = _.unique(tabs, (t) => {
            return t.url;
        });
        await removeDuplicateTabsByURL(tabs, uniqueTabs);
    }

    async tabDetach(_message, _sender, _sendResponse) {
        const w = await chrome.windows.getCurrent();
        chrome.windows.create({ tabId: _sender.tab.id, state: "maximized", incognito: w.incognito });
    }

    async tabDetachM(_message, _sender, _sendResponse) {
        const tabIds = await this.tabHandleMagic(_message, _sender, _sendResponse);
        const tabs = await this.tabsGetFromIds(tabIds);

        const w = await chrome.windows.getCurrent();
        let nw = await chrome.windows.create({ tabId: _sender.tab.id, state: "maximized", incognito: w.incognito });

        const ctab = await chrome.tabs.get(_sender.tab.id);
        for (let tabId of tabIds) {
            await chrome.tabs.move(tabId, {
                index: -1,
                windowId: ctab.windowId,
            });
        }
    }

    convertMessageArgsToMouselessArg(_message, _sender, _sendResponse) {
        _message.msg = _message.msg || {};
        let ret = {
            sender: _sender,
            request: {
                msg: _message.msg,
                repeats: 1,
            },
        };
        ret.request = _message.request || ret.request;
        return ret;
    }

    /**
     * Migrate from vrome and mouseless
     *
     * refactor myCloseTabXXX implementation -- ref https://github.com/hbt/mouseless/commit/97533a4787a7b50e233fe6879d0c8c5707fd71d6
     * @param _message
     * @param _sender
     * @param _sendResponse
     */
    tabClose(_message, _sender, _sendResponse) {
        let o = this.convertMessageArgsToMouselessArg(_message, _sender, _sendResponse);

        var _ = window._;
        var tab = o.sender.tab;
        var cond = o.request.msg.type;
        var msg = o.request.msg;
        msg.count = o.request.repeats;
        if (msg.count == 1) {
            delete msg.count;
        }
        if (cond === "otherWindows") {
            msg.otherWindows = true;
        }

        if (cond || msg.count > 1) {
            chrome.windows.getAll(
                {
                    populate: true,
                },
                function (windows) {
                    if (msg.otherWindows) {
                        // filter windows  without pinned tabs
                        windows = _.filter(windows, function (w) {
                            if (w.id === tab.windowId) return false;
                            else {
                                var noPinned = true;
                                _.each(w.tabs, function (v) {
                                    if (v.pinned) {
                                        noPinned = false;
                                    }
                                });
                                return noPinned;
                            }
                        });
                    } else {
                        // limit to current window
                        windows = _.filter(windows, function (w) {
                            return w.id === tab.windowId;
                        });
                    }

                    _.each(windows, function (w) {
                        var tabs = w.tabs;
                        tabs = _.filter(tabs, function (v) {
                            var closeMap = {
                                closeOther: v.id == tab.id || v.pinned,
                                closeLeft: v.id == tab.id || v.pinned || tab.index < v.index,
                                closeRight: v.id == tab.id || v.pinned || tab.index > v.index,
                                closePinned: !v.pinned,
                                closeUnPinned: v.pinned,
                                otherWindows: v.windowId == tab.windowId || v.pinned,
                                count: v.index >= tab.index,
                            };
                            return !closeMap[cond];
                        });
                        _.each(tabs, function (v, k) {
                            if (msg.count && k > msg.count) return;
                            chrome.tabs.remove(v.id);
                        });
                    });
                }
            );
        } else {
            if (!tab.pinned) {
                chrome.tabs.remove(tab.id);
            }
        }
    }

    async tabShowIndexPosition(_message, _sender, _sendResponse) {
        const ctab = await chrome.tabs.get(_sender.tab.id);
        let position = ctab.index + 1;
        this.sendResponse(_message, _sendResponse, { data: position });
    }

    tabUnpinAll(_message, _sender, _sendResponse) {
        let o = this.convertMessageArgsToMouselessArg(_message, _sender, _sendResponse);
        var _ = window._;
        var msg = o.request.msg;
        msg.allWindows = msg.allWindows || false;

        var tab = o.sender.tab;

        chrome.windows.getAll(
            {
                populate: true,
            },
            function (windows) {
                if (!msg.allWindows) {
                    windows = _.filter(windows, function (w) {
                        return w.id === tab.windowId;
                    });
                }
                _.each(windows, function (w) {
                    var tabs = _.filter(w.tabs, function (v) {
                        return v.pinned;
                    });

                    // no unpinned, then pin all of them
                    var pinned = false;
                    if (tabs.length === 0) {
                        tabs = w.tabs;
                        pinned = true;
                    }

                    _.each(tabs, function (t) {
                        chrome.tabs.update(t.id, { pinned: pinned }, function (new_tab) {});
                    });
                });
            }
        );
    }

    async tabQuickMarkSave(_message, _sender, _sendResponse) {
        const ctab = await chrome.tabs.get(_sender.tab.id);
        State.tabsQuickMarks.set(_message.mark, ctab.id);
        this.sendResponse(_message, _sendResponse, { msg: "Saved Tab Quickmark: " + _message.mark });
    }

    async tabQuickMarkJump(_message, _sender, _sendResponse) {
        if (State.tabsQuickMarks.has(_message.mark)) {
            let tabId = State.tabsQuickMarks.get(_message.mark);
            chrome.tabs.update(tabId, { active: true });
        }
    }

    async tabHandleMagic(_message, _sender, _sendResponse) {
        function filterDirectionRight() {
            let rightTabs = _.filter(currentWindowTabs, (tab) => {
                return tab.index > ctab.index;
            });
            rightTabs = _.map(rightTabs, (tab) => {
                return tab.id;
            });

            if (repeats > 0) {
                rightTabs = rightTabs.slice(0, repeats);
            }

            return rightTabs;
        }

        function filterDirectionLeft() {
            let leftTabs = _.filter(currentWindowTabs, (tab) => {
                return tab.index < ctab.index;
            });
            leftTabs = _.map(leftTabs, (tab) => {
                return tab.id;
            });

            if (repeats > 0) {
                leftTabs = leftTabs.reverse().slice(0, repeats);
            }

            return leftTabs;
        }

        function AllTabsInCurrentWindowExceptActiveTab() {
            let allOthers = _.filter(currentWindowTabs, (tab) => {
                return tab.id != ctab.id;
            });
            allOthers = _.map(allOthers, (tab) => {
                return tab.id;
            });

            return allOthers;
        }

        console.sassert(CustomCommonConfig.tabMagic.hasOwnProperty(_message.magic));

        function getChildrenTabsRecursively(tabId, all) {
            let ret = _.filter(all, (tab) => {
                if (State.tabOpenerIds.has(tab.id)) {
                    return State.tabOpenerIds.get(tab.id) === tabId;
                }
                return false;
            });

            ret = _.flatten(ret);

            _.each(ret, (tab) => {
                ret.push(getChildrenTabsRecursively(tab.id, all));
            });

            ret = _.flatten(ret);

            return ret;
        }

        let magic = _message.magic;
        let repeats = _message.repeats;
        const ctab = await chrome.tabs.get(_sender.tab.id);
        let retTabIds = [];
        const currentWindowTabs = await chrome.tabs.query({
            currentWindow: true,
        });

        if (_message.magic === "DirectionRight") {
            retTabIds = filterDirectionRight();
        } else if (_message.magic === "DirectionRightInclusive") {
            retTabIds = filterDirectionRight();
            retTabIds.push(ctab.id);
        } else if (_message.magic === "DirectionLeft") {
            retTabIds = filterDirectionLeft();
        } else if (_message.magic === "DirectionLeftInclusive") {
            retTabIds = filterDirectionLeft();
            retTabIds.push(ctab.id);
        } else if (_message.magic === "AllTabsInCurrentWindowExceptActiveTab") {
            retTabIds = AllTabsInCurrentWindowExceptActiveTab();
        } else if (_message.magic === "AllTabsInCurrentWindow") {
            retTabIds = AllTabsInCurrentWindowExceptActiveTab();
            retTabIds.push(ctab.id);
        } else if (_message.magic === "AllOtherTabsInOtherWindowsExceptAllTabsInCurrentWindow") {
            const otabs = await chrome.tabs.query({
                currentWindow: false,
            });

            retTabIds = _.map(otabs, (tab) => {
                return tab.id;
            });
        } else if (_message.magic === "AllWindowsNoPinnedTabsExceptCurrentWindow") {
            const owindows = await chrome.windows.getAll({
                populate: true,
            });
            let owindowsWithNoPinnedTabs = [];
            for (let owindow of owindows) {
                let pinnedTabFound = false;
                for (let otab of owindow.tabs) {
                    if (otab.pinned) {
                        pinnedTabFound = true;
                        break;
                    }
                }
                if (!pinnedTabFound) {
                    owindowsWithNoPinnedTabs.push(owindow);
                }
            }

            for (let owindow of owindowsWithNoPinnedTabs) {
                if (owindow.id === ctab.windowId) {
                    continue;
                }
                for (let otab of owindow.tabs) {
                    retTabIds.push(otab.id);
                }
            }
        } else if (_message.magic === "AllTabsInAllWindowExceptActiveTab") {
            const otabs = await chrome.tabs.query({});

            retTabIds = _.filter(otabs, (tab) => {
                return tab.id != ctab.id;
            });

            retTabIds = _.map(retTabIds, (tab) => {
                return tab.id;
            });
        } else if (_message.magic === "AllIncognitoWindowsIncludingPinnedIncognitoTabs") {
            const owindows = await chrome.windows.getAll({
                populate: true,
            });
            let incognitoWindows = [];
            for (let owindow of owindows) {
                if (owindow.incognito) {
                    incognitoWindows.push(owindow);
                }
            }

            for (let owindow of incognitoWindows) {
                for (let otab of owindow.tabs) {
                    if (otab.pinned) {
                        await chrome.tabs.update(otab.id, {
                            pinned: false,
                        });
                    }
                    if (State.tabsMarked.has(otab.id)) {
                        State.tabsMarked.delete(otab.id);
                    }
                    retTabIds.push(otab.id);
                }
            }
        } else if (_message.magic === "currentTab") {
            retTabIds = [ctab.id];
        } else if (_message.magic === "highlightedTabs") {
            retTabIds = Array.from(State.tabsMarked.keys());
        } else if (_message.magic === "childrenTabs") {
            const all = await chrome.tabs.query({});
            let childrenTabs = _.filter(all, (tab) => {
                if (State.tabOpenerIds.has(tab.id)) {
                    return State.tabOpenerIds.get(tab.id) === tabId;
                }
                return false;
            });
            retTabIds = _.map(childrenTabs, (tab) => {
                return tab.id;
            });
        } else if (_message.magic === "childrenTabsRecursively") {
            const all = await chrome.tabs.query({});
            let childrenTabsRecursively = getChildrenTabsRecursively(ctab.id, all);

            retTabIds = _.map(childrenTabsRecursively, (tab) => {
                return tab.id;
            });
        }

        return retTabIds;
    }

    async tabsGetFromIds(ids) {
        let ret = [];
        for (var i = 0; i < ids.length; i++) {
            const tab = await chrome.tabs.get(ids[i]);
            ret.push(tab);
        }
        return ret;
    }

    async tabUnsuspendM(_message, _sender, _sendResponse) {
        const tabIds = await this.tabHandleMagic(_message, _sender, _sendResponse);

        _.each(tabIds, (tabId) => {
            chrome.runtime.sendMessage(Constants.tabSuspenderExtensionID, {
                action: "unsuspend",
                tabId: tabId,
            });
        });
    }

    async tabSuspendM(_message, _sender, _sendResponse) {
        const tabIds = await this.tabHandleMagic(_message, _sender, _sendResponse);
        _.each(tabIds, (tabId) => {
            chrome.runtime.sendMessage(Constants.tabSuspenderExtensionID, {
                action: "suspend",
                tabId: tabId,
            });
        });
    }

    async focusTab(tab, focusWindow) {
        await chrome.windows.update(
            tab.windowId,
            {
                focused: focusWindow || false,
            },
            async () => {
                await chrome.tabs.update(tab.id, { active: true });
            }
        );
    }

    // TODO(hbt) NEXT optimize by tracking into a map and only updating the ones that aren't in the map
    async tabFixSuspended(_message, _sender, _sendResponse) {
        const ctab = await chrome.tabs.get(_sender.tab.id);
        const all = await chrome.tabs.query({});

        const wall = await chrome.windows.getAll({
            populate: true,
        });

        for (let w of wall) {
            let currentSelectedTab = _.select(w.tabs, (child) => {
                return child.active;
            })[0];

            for (let tab of w.tabs) {
                await this.focusTab(tab);
            }

            await this.focusTab(currentSelectedTab);
        }

        await this.focusTab(ctab, true);
    }

    async tabCloseM(_message, _sender, _sendResponse) {
        const tabIds = await this.tabHandleMagic(_message, _sender, _sendResponse);
        const tabs = await this.tabsGetFromIds(tabIds);

        let unpinnedTabs = _.filter(tabs, (tab) => {
            return !tab.pinned;
        });
        unpinnedTabs = _.map(unpinnedTabs, (tab) => {
            return tab.id;
        });

        if (_message.magic !== "highlightedTabs") {
            let highlightedIds = Array.from(State.tabsMarked.keys());
            unpinnedTabs = _.filter(unpinnedTabs, (id) => {
                return !highlightedIds.includes(id);
            });
        }
        await chrome.tabs.remove(unpinnedTabs);
        this.sendResponse(_message, _sendResponse, {
            msg: `Closed ${unpinnedTabs.length} tabs`,
        });
    }

    async copyTabURLsM(_message, _sender, _sendResponse) {
        const tabIds = await this.tabHandleMagic(_message, _sender, _sendResponse);
        const tabs = await this.tabsGetFromIds(tabIds);
        this._copyTabUrlsAndRespond(tabs, _message, _sendResponse);
    }

    copyAllTabsURLsInCurrentWindow(_message, _sender, _sendResponse) {
        chrome.tabs.query({ currentWindow: true }, (tabs) => {
            this._copyTabUrlsAndRespond(tabs, _message, _sendResponse);
        });
    }

    _copyTabUrlsAndRespond(tabs, _message, _sendResponse) {
        let text = tabs
            .map(function (tab) {
                return tab.url;
            })
            .join("\n");
        Clipboard.copy(text);
        this.sendResponse(_message, _sendResponse, { data: text, count: tabs.length });
    }

    async tabReloadM(_message, _sender, _sendResponse) {
        const tabIds = await this.tabHandleMagic(_message, _sender, _sendResponse);
        _.each(tabIds, (id) => {
            chrome.tabs.reload(id, { bypassCache: true });
        });
    }

    async tabGotoParent(_message, _sender, _sendResponse) {
        const ctab = await chrome.tabs.get(_sender.tab.id);
        if (ctab.hasOwnProperty("openerTabId")) {
            const all = await chrome.tabs.query({});
            let ids = _.pluck(all, "id");
            if (ids.includes(ctab.openerTabId)) {
                chrome.tabs.update(ctab.openerTabId, { active: true });
            }
        }
    }

    async tabToggleIncognito(_message, _sender, _sendResponse) {
        const ctab = await chrome.tabs.get(_sender.tab.id);

        chrome.windows.create({ url: ctab.url, incognito: !ctab.incognito, state: "maximized" });
    }

    async tabUndo(_message, _sender, _sendResponse) {
        function filterOutIncognito(incognito, lastRemoved) {
            let ret = [];
            for (let i = 0; i < lastRemoved.length; i++) {
                if (State.tabUrls.has(lastRemoved[i]) && State.tabUrls.get(lastRemoved[i]).incognito == incognito) {
                    ret.push(lastRemoved[i]);
                }
            }
            return ret;
        }

        const ctab = await chrome.tabs.get(_sender.tab.id);
        let lastRemoved = State.tabsRemoved.reverse();
        let repeats = _message.repeats;

        if (repeats > lastRemoved.length) {
            repeats = lastRemoved.length;
        }

        let filteredLastRemoved = filterOutIncognito(ctab.incognito, lastRemoved);

        for (let i = 0; i < repeats; i++) {
            if (filteredLastRemoved[i] && State.tabUrls.has(filteredLastRemoved[i])) {
                await chrome.tabs.create({ url: State.tabUrls.get(filteredLastRemoved[i]).url, index: ctab.index + 1 });
            }
        }

        let rm = [];
        for (let i = 0; i < repeats; i++) {
            rm.push(filteredLastRemoved.shift());
        }
        lastRemoved = _.without(lastRemoved, rm);
        State.tabsRemoved = lastRemoved.reverse();
    }

    async tabGoto(_message, _sender, _sendResponse) {
        let o = this.convertMessageArgsToMouselessArg(_message, _sender, _sendResponse);
        var id = o.request.id,
            index = o.request.index;
        chrome.tabs.query({ currentWindow: true }, function (tabs) {
            if (id) {
                return chrome.tabs.get(id, function (tabInfo) {
                    chrome.windows.update(tabInfo.windowId, { focused: true }, function () {
                        chrome.tabs.update(id, { active: true });
                    });
                });
            } else if (index !== void 0) {
                chrome.tabs.update(index < tabs.length ? tabs[index].id : tabs.slice(-1)[0].id, { active: true });
            }
        });
    }

    async tabReverseM(_message, _sender, _sendResponse) {
        const tabIds = await this.tabHandleMagic(_message, _sender, _sendResponse);
        const tabs = await this.tabsGetFromIds(tabIds);
        let indices = _.pluck(tabs, "index");
        let ids = tabIds.reverse();

        for (var i = 0; i < indices.length; i++) {
            await chrome.tabs.move(ids[i], { index: indices[i] });
        }
    }

    tabTogglePin(tab) {
        chrome.tabs.update(tab.id, { pinned: !tab.pinned }, function (new_tab) {});
    }

    async tabTogglePinM(_message, _sender, _sendResponse) {
        const tabIds = await this.tabHandleMagic(_message, _sender, _sendResponse);
        const tabs = await this.tabsGetFromIds(tabIds);

        tabs.forEach(this.tabTogglePin);
    }

    async tabToggleHighlightM(_message, _sender, _sendResponse) {
        const tabIds = await this.tabHandleMagic(_message, _sender, _sendResponse);
        const tabs = await this.tabsGetFromIds(tabIds);

        let ops = {
            rm: 0,
            add: 0,
        };
        tabs.forEach(function (tab) {
            if (State.tabsMarked.has(tab.id)) {
                State.tabsMarked.delete(tab.id);
                ops.rm++;
            } else {
                State.tabsMarked.set(tab.id, tab.windowId);
                ops.add++;
            }
        });

        this.sendResponse(_message, _sendResponse, {
            state: ops,
            count: State.tabsMarked.size,
        });
    }

    async tabPageCaptureM(_message, _sender, _sendResponse) {
        const tabIds = await this.tabHandleMagic(_message, _sender, _sendResponse);
        const tabs = await this.tabsGetFromIds(tabIds);

        tabs.forEach(function (tab) {
            chrome.pageCapture.saveAsMHTML({ tabId: tab.id }, function (data) {
                const blob = new Blob([data], {
                    type: "plain/mhtml",
                });
                let title = tab.title + " " + uid();
                var url = URL.createObjectURL(blob);
                const filename = title.replace(/\[title\]/g, title).replace(/[`~!@#$%^&*()_|+\-=?;:'",.<>{}[\]\\/]/gi, "-");
                chrome.downloads.download(
                    {
                        url: url,
                        saveAs: false,
                        filename: filename + ".mhtml",
                    },
                    () => {
                        URL.revokeObjectURL(url);
                    }
                );
            });
        });
    }

    async tabPrintM(_message, _sender, _sendResponse) {
        const tabIds = await this.tabHandleMagic(_message, _sender, _sendResponse);
        const tabs = await this.tabsGetFromIds(tabIds);

        tabs.forEach(function (tab) {
            chrome.tabs.executeScript(tab.id, {
                code: "window.document.title = window.document.title + ' ' +  \"" + uid() + '"' + ";window.print();",
            });
        });
    }

    async tabToggleHighlight(_message, _sender, _sendResponse) {
        // Note(hbt) remove highlight is a pain in the ass. Use an internal state; if needed save it in local storage
        const ctab = await chrome.tabs.get(_sender.tab.id);

        if (State.tabsMarked.has(ctab.id)) {
            State.tabsMarked.delete(ctab.id);
        } else {
            State.tabsMarked.set(ctab.id, ctab.windowId);
        }

        this.sendResponse(_message, _sendResponse, {
            state: State.tabsMarked.has(ctab.id),
            count: State.tabsMarked.size,
        });
    }

    async tabMoveHighlighted(_message, _sender, _sendResponse) {
        async function filterOutRemovedTabIds(tabIds) {
            let ret = [];
            const allTabs = await chrome.tabs.query({});
            const allTabIds = _.pluck(allTabs, "id");
            ret = _.filter(tabIds, (id) => {
                return allTabIds.includes(id);
            });
            return ret;
        }
        const ctab = await chrome.tabs.get(_sender.tab.id);
        let tabIds = Array.from(State.tabsMarked.keys());

        if (tabIds.length > 0) {
            tabIds = await filterOutRemovedTabIds(tabIds);
            chrome.tabs.move(tabIds, { windowId: ctab.windowId, index: ctab.index + 1 });
        }
    }

    async tabHighlightClearAll(_message, _sender, _sendResponse) {
        State.tabsMarked = new Map();
        this.sendResponse(_message, _sendResponse, {
            count: State.tabsMarked.size,
        });
    }

    async pageStylesheetToggleByDomain(_message, _sender, _sendResponse) {
        const ctab = await chrome.tabs.get(_sender.tab.id);
        var styleurl = _message.url;
        var hostname = Utils.getHostname(ctab.url);
        var tab = _sender.tab;

        chrome.storage.local.get("domainStylesheets", (data) => {
            let domainStylesheets = data.domainStylesheets || {};
            let settings = { domainStylesheets };
            settings.domainStylesheets[hostname] = settings.domainStylesheets[hostname] || {};

            // toggle
            if (settings.domainStylesheets[hostname] === styleurl) {
                settings.domainStylesheets[hostname] = "";
                delete settings.domainStylesheets[hostname];
            } else {
                settings.domainStylesheets[hostname] = styleurl;
            }

            chrome.storage.local.set({ domainStylesheets: settings.domainStylesheets }, function (data) {
                chrome.tabs.reload(tab.id);
            });
        });
    }

    static async pageStylesheetLoadByDomain(changeInfo, tab) {
        if (changeInfo.status === "loading") {
            var hostname = Utils.getHostname(tab.url);

            chrome.storage.local.get("domainStylesheets", (data) => {
                let domainStylesheets = data.domainStylesheets || {};
                if (domainStylesheets.hasOwnProperty(hostname)) {
                    $.ajax({
                        url: domainStylesheets[hostname],
                    }).done(function (data) {
                        chrome.tabs.insertCSS(
                            tab.id,
                            {
                                code: data,
                                runAt: "document_start",
                                allFrames: true,
                            },
                            function (res) {}
                        );
                    });
                }
            });
        }
    }

    static async tabSendMessageOnWhenDoneLoading(changeInfo, tab) {
        if (changeInfo.status === "complete") {
            chrome.tabs.sendMessage(tab.id, {
                action: "tabDoneLoading",
            });
        }
    }

    async downloadShowLastFile(_message, _sender, _sendResponse) {
        // TODO(hbt) Refactor (low): merge with downloadOpenLastFile -- use a msg
        chrome.downloads.search(
            {
                exists: true,
                state: "complete",
            },
            function (dlds) {
                if (!dlds) {
                    return;
                }
                // sort dlds by end time
                let sortedDlds = window._.sortBy(dlds, (v) => {
                    return v.endTime;
                });
                let last = sortedDlds.pop();
                chrome.downloads.show(last.id);
            }
        );
    }

    async downloadOpenLastFile(_message, _sender, _sendResponse) {
        // Note(hbt) partial implementation - view http://stackoverflow.com/questions/26775564/how-to-open-a-downloaded-file
        chrome.downloads.search(
            {
                exists: true,
                state: "complete",
            },
            function (dlds) {
                if (!dlds) {
                    return;
                }
                // sort dlds by end time
                let sortedDlds = window._.sortBy(dlds, (v) => {
                    return v.endTime;
                });
                let last = sortedDlds.pop();
                chrome.downloads.open(last.id);
            }
        );
    }

    async bookmarkAddM(_message, _sender, _sendResponse) {
        const tabIds = await this.tabHandleMagic(_message, _sender, _sendResponse);
        const tabs = await this.tabsGetFromIds(tabIds);
        let folder = _message.folder;
        let bfolder = await this._getBookmarkFolder(folder);

        let count = 0;
        for (let i = 0; i < tabs.length; i++) {
            if (!(await this.isBookmarkedTab(tabs[i], folder))) {
                await this._bookmarkAdd(tabs[i], folder);
                count++;
            }
        }

        let msg = `Added ${count} bookmark(s) to ${folder}`;
        this.sendResponse(_message, _sendResponse, {
            msg: msg,
        });
    }

    async bookmarkRemoveM(_message, _sender, _sendResponse) {
        const tabIds = await this.tabHandleMagic(_message, _sender, _sendResponse);
        const tabs = await this.tabsGetFromIds(tabIds);
        let folder = _message.folder;
        let bfolder = await this._getBookmarkFolder(folder);

        let count = 0;
        for (let i = 0; i < tabs.length; i++) {
            if (await this.isBookmarkedTab(tabs[i], folder)) {
                await this._bookmarkRemove(tabs[i], folder);
                count++;
            }
        }

        let msg = `Removed ${count} bookmark(s) to ${folder}`;
        this.sendResponse(_message, _sendResponse, {
            msg: msg,
        });
    }

    async bookmarkSaveYoutube(_message, _sender, _sendResponse) {
        let cthis = this;
        async function removeOtherBookmarkPlaybacks(strurl, folder) {
            let url = new URL(strurl);
            url.searchParams.delete("t");

            let children = await cthis._getBookmarkChildren(folder);
            children = Object.values(children);
            for (let child of children) {
                if (child.url.startsWith(url.toString())) {
                    let bmarks = await chrome.bookmarks.search({ url: child.url });
                    let ids = _.pluck(bmarks, "id");
                    for (let id of ids) {
                        await chrome.bookmarks.remove(id);
                    }
                }
            }
        }

        const currentTab = await chrome.tabs.get(_sender.tab.id);
        let currentTabURL = this._removeTrailingSlash(currentTab.url);

        let url = new URL(currentTabURL);
        url.searchParams.set("t", _message.duration);

        await removeOtherBookmarkPlaybacks(url.toString(), _message.folder);
        currentTab.url = url.toString();
        await this._bookmarkAdd(currentTab, _message.folder);

        this.sendResponse(_message, _sendResponse, {
            msg: "Saved timestamp at: " + _message.duration,
        });
    }

    async bookmarkToggle(_message, _sender, _sendResponse) {
        let cthis = this;
        function getYoutubeVideoFromPlaylist(url) {
            console.assert(url.indexOf("youtube.com") !== -1 && url.indexOf("&list=") !== -1);
            let curl = new URL(url);
            let nurl = "https://www.youtube.com/watch?v=" + curl.searchParams.get("v");
            return nurl;
        }
        async function isYoutubePlaylistAndVideoIsBookmarked(url, folder) {
            if (url.indexOf("youtube.com") !== -1 && url.indexOf("&list=") !== -1) {
                let nurl = getYoutubeVideoFromPlaylist(url);
                return await cthis._isBookmarkedUrlStartingWith(nurl, folder);
            }
            return false;
        }
        async function removeFromPlaybackBookmarks(url) {
            let children = await cthis._getBookmarkChildren("playback");
            children = Object.values(children);
            let curl = new URL(url);
            for (let child of children) {
                let childurl = new URL(child.url);
                if (childurl.searchParams.get("v") === curl.searchParams.get("v")) {
                    await chrome.bookmarks.remove(child.id);
                }
            }
        }
        {
            const currentTab = await chrome.tabs.get(_sender.tab.id);
            let currentTabURL = this._removeTrailingSlash(currentTab.url);

            let msg = "";

            if (_message.folder === "playback") {
                await removeFromPlaybackBookmarks(currentTabURL);
                msg = `Removed ${currentTabURL} from bookmark folder ${_message.folder}`;
            } else {
                if (await isYoutubePlaylistAndVideoIsBookmarked(currentTabURL, _message.folder)) {
                    let nurl = getYoutubeVideoFromPlaylist(currentTabURL);
                    await this._bookmarkRemoveByURLStartingWith(nurl, _message.folder);
                    msg = `Removed playlist video ${nurl} from bookmark folder ${_message.folder}`;
                } else {
                    if (await this.isBookmarkedTab(currentTab, _message.folder)) {
                        await this._bookmarkRemove(currentTab, _message.folder);
                        msg = `Removed ${currentTabURL} from bookmark folder ${_message.folder}`;
                    } else {
                        await this._bookmarkAdd(currentTab, _message.folder);
                        msg = `Added ${currentTabURL} to bookmark folder ${_message.folder}`;
                    }
                }
            }

            this.sendResponse(_message, _sendResponse, {
                msg: msg,
            });
        }
    }

    async _bookmarkRemoveByURLStartingWith(url, bookmarkFolderString) {
        let children = await this._getBookmarkChildren(bookmarkFolderString);
        let filtered = _.keys(children).filter((v) => {
            return v.startsWith(this._removeTrailingSlash(url));
        });
        // Note(hbt) prevent accidentally matching too many bookmarks.
        console.sassert(filtered.length <= 1);
        for (let url of filtered) {
            let b = children[url];
            await chrome.bookmarks.remove(b.id);
        }
    }

    async _bookmarkRemoveByURL(url, bookmarkFolderString) {
        let children = await this._getBookmarkChildren(bookmarkFolderString);
        let nurl = this._removeTrailingSlash(url);
        let b = children[nurl];
        await chrome.bookmarks.remove(b.id);
    }
    async _bookmarkRemove(currentTab, bookmarkFolderString) {
        await this._bookmarkRemoveByURL(currentTab.url, bookmarkFolderString);
    }

    async _bookmarkAdd(currentTab, bookmarkFolderString) {
        var title = currentTab.title;
        let currentTabURL = this._removeTrailingSlash(currentTab.url);
        let bookmarkFolder = await this._getBookmarkFolder(bookmarkFolderString);
        title = title.trim();
        // Note(hbt) remove first word -- assume tab index is on
        title = title.substr(title.indexOf(" ") + 1);

        const b = chrome.bookmarks.create({
            parentId: bookmarkFolder.id,
            url: currentTabURL,
            title: title,
        });
    }

    async _isBookmarkedUrlStartingWith(url, bookmarkFolderString) {
        let children = await this._getBookmarkChildren(bookmarkFolderString);
        let filtered = _.keys(children).filter((v) => {
            return v.startsWith(this._removeTrailingSlash(url));
        });
        // Note(hbt) prevent accidentally matching too many bookmarks.
        console.sassert(filtered.length <= 1);
        let ret = filtered.length > 0;
        return ret;
    }

    async _isBookmarkedUrl(url, bookmarkFolderString) {
        let children = await this._getBookmarkChildren(bookmarkFolderString);
        let ret = _.keys(children).includes(this._removeTrailingSlash(url));
        return ret;
    }

    async isBookmarkedTab(ctab, bookmarkFolderString) {
        let children = await this._getBookmarkChildren(bookmarkFolderString);
        let ret = _.keys(children).includes(this._removeTrailingSlash(ctab.url));
        return ret;
    }

    async _getBookmarkFolder(bookmarkFolderString) {
        let collection = await chrome.bookmarks.search({ title: bookmarkFolderString });
        if (collection.length == 0) {
            throw new Error("bookmark folder not found: " + bookmarkFolderString);
        }
        let ret = null;
        for (let bf of collection) {
            if (bf.title === bookmarkFolderString) {
                ret = bf;
                break;
            }
        }

        if (ret === null) {
            throw new Error("bookmark folder not found: " + bookmarkFolderString);
        }

        return ret;
    }

    async _getBookmarkChildren(bookmarkFolderString) {
        let bookmarkFolder = await this._getBookmarkFolder(bookmarkFolderString);
        const bchildren = await chrome.bookmarks.getChildren(bookmarkFolder.id);
        let children = _.map(bchildren, (child) => {
            child.url = this._removeTrailingSlash(child.url);
            return child;
        });
        children = _.indexBy(children, "url");
        return children;
    }

    _removeTrailingSlash(url) {
        if (url && url.endsWith("/")) {
            url = url.substring(0, url.length - 1);
        }
        return url;
    }

    async bookmarkLookupCurrentURL(_message, _sender, _sendResponse) {
        // // Note(hbt) search with and without slash due to legacy stuff

        async function findBookmarkFoldersFromURL(url) {
            let marks = await chrome.bookmarks.search({ url: url });

            let titles = [];
            let folderIds = [];
            for (let i = 0; i < marks.length; i++) {
                folderIds.push(marks[i].parentId);
            }

            for (let i = 0; i < folderIds.length; i++) {
                let folder = null;
                try {
                    folder = await chrome.bookmarks.getSubTree(folderIds[i]);
                } catch (e) {}
                if (!folder) {
                    continue;
                }

                titles.push(folder[0].title);
            }

            return titles;
        }

        async function findBookmarkTitlesFromURL(url) {
            let marks = await chrome.bookmarks.search({ url: url });

            let titles = [];
            for (let i = 0; i < marks.length; i++) {
                titles.push(marks[i].title);
            }

            titles = _.unique(titles);

            return titles;
        }

        const ctab = await chrome.tabs.get(_sender.tab.id);
        let url1 = ctab.url;
        let url2 = this._removeTrailingSlash(ctab.url);
        let folders1 = await findBookmarkFoldersFromURL(url1);
        let folders2 = await findBookmarkFoldersFromURL(url2);
        let folders = _.uniq(_.flatten([folders1, folders2]));

        let titles1 = await findBookmarkTitlesFromURL(url1);
        let titles2 = await findBookmarkTitlesFromURL(url2);
        let titles = _.uniq(_.flatten([titles1, titles2]));

        this.sendResponse(_message, _sendResponse, {
            msg: ["Titles:", titles.join("\n"), "Folders:", folders.join("\n")],
        });
    }

    async bookmarkCutFromFolder(_message, _sender, _sendResponse) {
        let cthis = this;

        async function copyIntoClipboardAsBackup() {
            let ret = await cthis.bookmarkCopyFolderHelper(_message, _sender, _sendResponse);
        }

        async function cutBookmarks() {
            const matchedMarks = await chrome.bookmarks.search(_message.folder);
            const folders = _.filter(matchedMarks, (mark) => {
                return !mark.hasOwnProperty("url");
            });
            const folderId = folders[0].id;
            const bmarks = await chrome.bookmarks.getSubTree(folderId);
            console.sassert(bmarks.length == 1);
            console.sassert(bmarks[0].children.length > 0);
            console.sassert(bmarks[0].children.length >= _message.repeats);
            let children = bmarks[0].children;
            if (_message.reverse) {
                children = children.reverse();
            }
            children = children.slice(0, _message.repeats);
            for (let child of children) {
                await chrome.bookmarks.remove(child.id);
            }
        }

        // safety check
        if (_message.repeats > 0 && _message.repeats < 50) {
            await copyIntoClipboardAsBackup();
            await cutBookmarks();

            this.sendResponse(_message, _sendResponse, {
                msg: "Cut " + _message.repeats + " bookmarks from folder: " + _message.folder,
            });
        }
    }

    async bookmarkCopyFolderHelper(_message, _sender, _sendResponse) {
        // get subtree
        const matchedMarks = await chrome.bookmarks.search(_message.folder);
        const folders = _.filter(matchedMarks, (mark) => {
            return !mark.hasOwnProperty("url");
        });
        const folderId = folders[0].id;
        const bmarks = await chrome.bookmarks.getSubTree(folderId);
        let urls = this._deepPluck(_, bmarks, "url");
        urls = _.map(urls, (url) => {
            return this._removeTrailingSlash(url);
        });
        urls = _.unique(urls);
        if (_message.reverse) {
            urls = urls.reverse();
        }
        if (_message.repeats > 0) {
            urls = urls.slice(0, _message.repeats);
        }
        const count = urls.length;
        let strurls = urls.join("\n");
        Clipboard.copy(strurls);

        let result = {
            msg: `Copied ${count} URLS`,
            urls: urls,
        };

        return result;
    }

    async bookmarkCopyFolder(_message, _sender, _sendResponse) {
        let result = await this.bookmarkCopyFolderHelper(_message, _sender, _sendResponse);
        this.sendResponse(_message, _sendResponse, result);
    }

    async bookmarkEmptyFolder(_message, _sender, _sendResponse) {
        this.bookmarkEmptyFolderContents(_message.folder, () => {
            this.sendResponse(_message, _sendResponse, {
                msg: `Emptied bookmark folder ${_message.folder}`,
            });
        });
    }

    async bookmarkDumpFolder(_message, _sender, _sendResponse) {
        let url = "http://localhost:7077/rest-begin-folder-edit.php?folder_name=" + _message.folder;
        $.ajax({
            url: url,
            async: false,
        }).done((data) => {
            console.log(data);
            this.sendResponse(_message, _sendResponse, {
                msg: `Dumped bookmark folder ${_message.folder}`,
            });
        });
    }

    async bookmarkLoadFolder(_message, _sender, _sendResponse) {
        var _ = window._;
        var cbl = this;

        function deepPluck(obj, k) {
            return cbl._deepPluck(_, obj, k);
        }

        function emptyExistingFolder(folder, callback) {
            cbl.bookmarkEmptyFolderContents(folder, callback);
        }

        function loadEditedBookmarks(folder) {
            function getBookmarksJSON() {
                let ret = "";
                let url = "http://localhost:7077/rest-finish-folder-edit.php";
                $.ajax({
                    url: url,
                    async: false,
                }).done(function (data) {
                    ret = JSON.parse(data);
                    console.assert(_.isObject(ret.roots), "bookmarks loaded properly");
                });
                return ret;
            }

            function loadBookmarksIntoFolder(marks, folder) {
                function createMark(mark, folderId, index) {
                    if (mark.type === "folder") {
                        chrome.bookmarks.create(
                            {
                                parentId: folderId,
                                title: mark.name,
                                index: index,
                            },
                            function (nmark) {
                                if (mark.children) {
                                    _.each(mark.children, (child, index) => {
                                        createMark(child, nmark.id, index);
                                    });
                                }
                            }
                        );
                    }

                    if (mark.type === "url") {
                        chrome.bookmarks.create(
                            {
                                parentId: folderId,
                                title: mark.name,
                                url: mark.url,
                                index: index,
                            },
                            function (nmark) {}
                        );
                    }
                }

                {
                    chrome.bookmarks.search(
                        {
                            title: folder,
                        },
                        function (smarks) {
                            console.assert(smarks.length === 1, "folder is the only one with that name");
                            let folderId = smarks[0].id;

                            _.each(marks, (mark, index) => {
                                createMark(mark, folderId, index);
                            });
                        }
                    );
                }
            }

            function getBookmarksByFolderName(allmarks, folder) {
                var children = deepPluck(allmarks.roots, "children");
                var child = _.select(children, (child) => {
                    return child.type == "folder" && child.name == folder;
                });
                console.assert(_.isArray(child) && child[0].children.length > 0, "found folder and it has data");
                return child[0].children;
            }

            {
                let allmarks = getBookmarksJSON();
                let bmarks = getBookmarksByFolderName(allmarks, folder);
                loadBookmarksIntoFolder(bmarks, folder);
            }
        }

        emptyExistingFolder(_message.folder, function () {
            loadEditedBookmarks(_message.folder);
        });
    }

    _deepPluck(_, obj, k) {
        function deepPluck(obj, k) {
            let ret = [];

            if (_.isArray(obj)) {
                _.each(obj, function (i) {
                    ret.push(deepPluck(i, k));
                });
            } else if (_.isObject(obj) && _.has(obj, k)) {
                ret.push(obj[k]);
            }

            if (_.isObject(obj)) {
                _.each(_.keys(obj), function (key) {
                    ret.push(deepPluck(obj[key], k));
                });
            }

            return _.flatten(ret);
        }

        return deepPluck(obj, k);
    }

    bookmarkEmptyFolderContents(folder, callback) {
        chrome.bookmarks.search(
            {
                title: folder,
            },
            function (marks) {
                console.assert(marks.length === 1, "folder is the only one with that name");

                var omark = marks[0];

                chrome.bookmarks.removeTree(marks[0].id, function () {
                    chrome.bookmarks.create(
                        {
                            parentId: omark.parentId,
                            title: omark.title,
                            index: omark.index,
                        },
                        function () {
                            callback();
                        }
                    );
                });
            }
        );
    }

    async getTabId(message, sender, sendResponse) {
        const ctab = await chrome.tabs.get(sender.tab.id);
        this.sendResponse(message, sendResponse, {
            tabId: sender.tab.id,
        });
    }

    async urlEditExternalEditor(message, sender, sendResponse) {
        const ctab = await chrome.tabs.get(sender.tab.id);
        message.text = ctab.url;

        var xhr = new XMLHttpRequest();
        xhr.open("POST", "http://127.0.0.1:8001");
        xhr.onreadystatechange = () => {
            if (xhr.readyState === 4 && xhr.status === 200) {
                this.sendResponse(message, sendResponse, {
                    type: "editWithVIMCallback",
                    text: xhr.responseText,
                    elementId: message.elementId,
                });
            }
        };
        xhr.send(
            JSON.stringify({
                data: "" + (message.text || ""),
                line: message.line || 0,
                column: message.column || 0,
            })
        );
    }

    async openSourceCodeExternalEditor(message, sender, sendResponse) {
        const ctab = await chrome.tabs.get(sender.tab.id);
        // message.text = ctab.url;

        var xhr = new XMLHttpRequest();
        xhr.open("POST", "http://127.0.0.1:8001");
        xhr.onreadystatechange = () => {
            if (xhr.readyState === 4 && xhr.status === 200) {
                this.sendResponse(message, sendResponse, {
                    type: "editWithVIMCallback",
                    text: xhr.responseText,
                    elementId: message.elementId,
                });
            }
        };
        xhr.send(
            JSON.stringify({
                data: "" + (message.text || ""),
                line: message.line || 0,
                column: message.column || 0,
            })
        );
    }

    async bajax(message, sender, sendResponse) {
        {
            let res = this.sendResponse;
            $.ajax({
                type: message.data.type,
                contentType: message.data.contentType,
                url: message.data.url,
                data: message.data.data,
                success: function (ret) {
                    res(message, sendResponse, {
                        state: "success",
                        result: ret,
                    });
                },
                error: function (e) {
                    res(message, sendResponse, {
                        state: "error",
                        result: ret,
                    });
                },
            });
        }
    }

    async setBackgroundLocalStorage(message, sender, sendResponse) {
        localStorage.setItem(message.key, message.value);
    }

    async getBackgroundLocalStorage(message, sender, sendResponse) {
        let v = localStorage.getItem(message.key);
        this.sendResponse(message, sendResponse, {
            value: v,
        });
    }
}

{
    let cc = new CustomBackground();
    cc.init();
    // setTimeout(CustomBackground.handleCtrlWFeature, 3000)
}

(async () => {})();
