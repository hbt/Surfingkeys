// used by IDE to jump around file. doesnt mean anything
var mmconfig = {};
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Sections
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Custom Code
// Settings
// Init Code
// Zoom
// Scrolling
// Clipboard
// AceEditor
// Hints
// Tabs
// URLs
// Marking
// Quickmarks
// Insert
// Omnibar
// Visual
// Session Management
// Search
// Downloads
// Bookmarks
// Misc
// Disabled
// Configuration by domain
// Private
// Snippets

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Custom Code
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.CustomCode = {};


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Settings
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.Settings = {};

Hints.characters = "dsafrewqtgc";
Hints.characters = "gascqwrtzfd";
Hints.characters = "gaswqbertdf";
// TODO(hbt) ENHANCE add shortcut to pick first choice but not replace input (e.g when googling, it will replace by suggested if this is true) -- in omnibar, pick first suggestion using key shortcut
// settings.focusFirstCandidate	= true
settings.smoothScroll = false;
// TODO(hbt) // TODO(hbt) INVESTIGATE  why is the mouseless one smarter?
settings.prevLinkRegex = /((?!last)(prev(ious)?|back|<|<<«|less|‹|上一页|上一张|上页)+)/i;
settings.nextLinkRegex = /((?!first)(next|next page|forward|>|>>|›|»|下一页|下一张|下页)+)/i;
settings.hintAlign = "left";
settings.focusAfterClosed = "left";
// TODO(hbt) ENHANCE add shortcut to make this left on demand / toggle
settings.newTabPosition = "right";
settings.interceptedErrors = ["*"];
settings.startToShowEmoji = 500;
settings.digitForRepeat = true;
settings.modeAfterYank = "Normal";
settings.scrollStepSize = 50;
// TODO(hbt) ENHANCE tab indices + toggle / detect
settings.showTabIndices = true;

// set theme
settings.theme = `
.sk_theme {
    font-size: 13pt;
}
#sk_status {
    display: none;
    opacity: 0;
}
#sk_find {
    font-size: 20pt;
}`;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Init code
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.InitCode = {};

{
    let mc = new MyCustomMapping();
    mc.init();

    // printAllCommands();

    unmapAllExcept([]);
    (async () => {
        console.assert((await CustomCommands.testMyPort()).test === "works");
    })();
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Zoom
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.Zoom = {};

amap("Zr", "zoom reset");
amap("Zi", "zoom in");
amap("Zo", "zoom out");

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Scrolling
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.Scrolling = {};
// TODO(hbt) ENHANCE scrolling passes the key after a while. even happens on PMR with s key

amap("G", "scroll to the bottom of the page");
amap("gf", "scroll to the bottom of the page");
amap("gg", "scroll to the top of the page");
amap("j", "scroll down");
amap("l", "scroll right");
amap("k", "scroll up");
amap("s", "scroll down");
amap("w", "scroll up");
amap("h", "scroll left");
amap("a", "scroll left");
amap("d", "scroll right");
amap("%", "scroll to percentage of current page");
amap("0", "scroll all the way to the left");
amap("ga", "scroll all the way to the left");
amap("$", "scroll all the way to the right");
amap("gd", "scroll all the way to the right");

amap("g]", "switch frames");

// TODO(hbt) INVESTIGATE
// amap("cS", "reset scroll target");
// amap("cs", "change scroll target");

// disabled
// amap("e", "scroll a page up");
// amap("d", "scroll a page down");

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Clipboard
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.Clipboard = {};

// page / hints based

// multi
amap("yma", "copy multiple link urls to the clipboard");
amap("ymc", "copy multiple columns of a table");
amap("ymv", "yank text of multiple elements");

// single
amap("ya", "copy a link url to the clipboard");
amap("yf", "copy a link url to the clipboard");
amap("yc", "copy a column of a table");
amap("yv", "yank text of an element");
amap("yd", "yank text of an element");
amap("yi", "yank text of an input");

mapkey("of", "Open link incognito", CustomCommands.hintOpenLinkIncognito);
mapkey("nf", "Open link incognito", CustomCommands.hintOpenLinkIncognito);

// No hints (misc)
// TODO(hbt) ENHANCE open source in editor
amap("ysrc", "copy current page's source");
amap("y.", "copy current settings");

mapkey("yy", "Copy url", CustomCommands.copyRootURL);
mapkey("yw", "Copy all urls", CustomCommands.copyAllTabsURLsInCurrentWindow);
mapkey("ymd", "#7Copy current page's URL as markdown", function() {
    Clipboard.write("[" + document.location.href + "](" + window.location.href + ")");
});
mapkey("ymt", "#7Copy current page's Title as markdown", function() {
    Clipboard.write("[" + document.title + "](" + window.location.href + ")");
});
amap("yh", "copy current page's host");
amap("yl", "copy current page's title");

// capture / screenshot

amap("ysf", "capture current full page");
amap("yss", "capture scrolling element");
amap("ysc", "capture current page");

// paste
mapkey("p", "", CustomCommands.pasteFromClipboard);
mapkey("P", "", CustomCommands.pasteFromClipboardNewTab);

// web dev

amap("yJ", "copy form data in json on current page");
amap("yP", "copy form data for post on current page");

// TODO(hbt) INVESTIGATE doesnt work on phpmyadmin -- 1 or 2 columns too late
// amap("ymc", "copy multiple columns of a table");
// TODO(hbt) INVESTIGATE doesnt do anything -- check if downloads is in manifest
// amap("yd", "copy current downloading url");
// TODO(hbt) INVESTIGATE
// amap("yq", "copy pre text");

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// AceEditor
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.AceEditor = {};

// TODO(hbt) INVESTIGATE check ace shortcuts
// pages/options.js:57
// https://github.com/ajaxorg/ace/wiki/Default-Keyboard-Shortcuts
// https://ace.c9.io/demo/keyboard_shortcuts.html

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Hints
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.Hints = {};

// TODO(hbt) FIXME fix hints f working but not c --- at the bottom of https://www.pogdesign.co.uk/cat/1-2019
amap("f", "open a link, press shift to flip hints if they are overlapped.");
amap("<Alt-c>", "open multiple links in a new tab");
amap("c", "open a link in non-active new tab");
mapkey("of", "Open link incognito", CustomCommands.hintOpenLinkIncognito);

amap("C", "open a link in new tab");
// amap("C", "NormalOpen a link in non-active new tab");
amap("<Alt-m>", "mouse over elements.");
amap("<Alt-,>", "mouse out elements.");
// amap("Fi", "click on an image or a button");

// // TODO(hbt) ENHANCE add more mappings for pages -- check forks
// TODO(hbt) FIXME fails pattern.test is not a function
amap("[[", "click on the previous link on current page");
amap("]]", "click on the next link on current page");
// mapkey('[[', '#1Click on the \'previous\' link on current page', function() {
// 	var prevLinks = $('a').regex(/((<<|prev(ious)?|old(er)?)+)/i);
// 	if (prevLinks.length) {
// 		clickOn(prevLinks);
// 	} else {
// 		walkPageUrl(-1);
// 	}
// });
// mapkey(']]', '#1Click on the \'next\' link on current page', function() {
// 	var nextLinks = $('a').regex(/((>>|next|new(er)?)+)/i);
// 	if (nextLinks.length) {
// 		clickOn(nextLinks);
// 	} else {
// 		walkPageUrl(1);
// 	}
// });

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Tabs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.Tabs = {};

// TODO(hbt) ENHANCE prevent marked tabs from being closed
// TODO(hbt) ENHANCE fix paste opening at the end instead of right to tab
// TODO(hbt) ENHANCE cw doesnt work on google -- maybe new code?
// TODO(hbt) ENHANCE prevent pinned from being closed with cw
// TODO(hbt) ENHANCE send tabs to peco and select from there for highlight
// TODO(hbt) ENHANCE tabs undo -- instead of pop up. given a count, restore last 5 tabs

// TODO(hbt) ENHANCE add option for direction and add support for repeats for all tabs commands e.g map("tc", tabClose) then e/q is passed as option, repeats are passed to indicate nb times + also operate on marked tabs -- exampleWithRepeatAndDirection

// TODO(hbt) INVESTIGATE ideas
{
    // https://github.com/hbt/mouseless/issues/148
    // https://github.com/hbt/mouseless/issues/149
    // https://github.com/hbt/mouseless/issues/145
    // https://github.com/hbt/mouseless/issues/129
    // https://github.com/hbt/mouseless/issues/129
    // https://github.com/hbt/mouseless/issues/144
}
// Closing

// TODO(hbt) FIXME tce 2 tabs donest work -- cannot reproduce easily. but definitely happens with tce where as tcc still works. or tce would work partially only. could be related to the port issue.  port disconnects on some tabs
mapkey("tcq", "", CustomCommands.tabCloseLeft);
mapkey("tce", "", CustomCommands.tabCloseRight);
mapkey("tcc", "", CustomCommands.tabCloseOthersInWindow);
mapkey("tcw", "", CustomCommands.windowCloseOtherWindows);
mapkey("tcg", "", CustomCommands.tabCloseOthersInAllWindows);
amap("tw", "close current tab");

amap("tg0", "go to the first tab");
amap("tgq", "go to the first tab");
amap("gte", "go to the last tab");
mapkey("tg", "", CustomCommands.tabGoto);

// merging
// TODO(hbt) ENHANCE consider adding a [X] in front of title or maybe after index
mapkey("th", "toggle highlight", CustomCommands.tabToggleHighlight);
mapkey("tH", "clear highlight", CustomCommands.tabHighlightClearAll);
mapkey("tp", "put", CustomCommands.tabMoveHighlighted);

// Manipulation

// TODO(hbt) ENHANCE add detach with children + go to parent (from child)
// mapkey("tk", "Toggle Switch Tab Opening Position", CustomCommands.tabToggleSwitchTabNewPosition);
mapkey("td", "Detach", CustomCommands.tabDetach);
amap("tq", "move current tab to left");
amap("te", "move current tab to right");
amap("tv", "duplicate current tab");
amap("q", "go one tab left");
amap("e", "go one tab right");
// TODO(hbt) ENHANCE reloadall
// TODO(hbt) ENHANCE reloadall but current
// TODO(hbt) ENHANCE reloadall but current window
amap("r", "reload the page");
mapkey("R", "#4Reload the page", function() {
    RUNTIME("reloadTab", { nocache: true });
});

amap("tl", "pin/unpin current tab");
mapkey("tL", "", CustomCommands.tabTogglePinAll);
mapkey("WL", "", CustomCommands.windowsTogglePinAll);
amap("tm", "mute/unmute current tab");
// TODO(hbt) ENHANCE add 5tu to restore 5 recenlty closed
amap("tu", "open recently closed url");
amap("tz", "restore closed tab");
amap("t`", "go to last used tab");
amap("``", "go to last used tab");

// TODO(hbt) FIXME maximized
amap("ti", "open incognito window");
// TODO(hbt) ENHANCE not maximized
amap("tI", "open incognito window");

// Tab Selection
// use fuzzy finder instead
mapkey("tt", "new tab", function() {
    tabOpenLink("https://www.google.com");
});
amap("ot", "choose a tab");
amap("`1", "go one tab history back");
amap("`2", "go one tab history forward");

// TODO(hbt) INVESTIGATE
// amap("gT", "go to first activated tab");
// amap("gt", "go to last activated tab");

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// URLs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.URLs = {};

mapkey("<Ctrl-a>", "Increment URL", CustomCommands.urlIncrementLastPath);
mapkey("<Ctrl-x>", "Decrement URL", CustomCommands.urlDecrementLastPath);

amap("gu", "go up one path in the url");
amap("gU", "go to root of current url hierarchy");
amap("g?", "reload current page without query string(all parts after question mark)");
amap("ute", "edit current url with vim editor, and open in new tab");
amap("Ue", "edit current url with vim editor, and open in new tab");
amap("ue", "edit current url with vim editor, and reload");
mapkey("uE", "edit current url with gvim editor, and reload", CustomCommands.urlEditExternalEditor);

// TODO(hbt) INVESTIGATE URL transformer? makelink?
amap("Ol", "open detected links from text");

// history
amap("A", "go back in history");
amap("D", "go forward in history");
amap("H", "open opened url in current tab");

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Marking
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.Marking = {};

mapkey("m", "#10Add current URL to vim-like marks", CustomCommands.addVIMark);
mapkey("'", "#10Jump to vim-like mark", CustomCommands.jumpVIMark);
mapkey("<Ctrl-'>", "#10Jump to vim-like mark in new tab.", function(mark) {
    Normal.jumpVIMark(mark, true);
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// QuickMarks
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.QuickMarks = {};

// chrome
amap("gca", "open chrome about");
amap("gcb", "open chrome bookmarks");
amap("gcc", "open chrome cache");
amap("gcd", "open chrome downloads");
amap("gch", "open chrome history");
amap("gck", "open chrome cookies");
amap("gce", "open chrome extensions");
amap(",e", "open chrome extensions");
amap("gcn", "open chrome net-internals");
amap("gsrc", "view page source");
mapkey(",se", "open chrome settings", function() {
    tabOpenLink("chrome://settings");
});
mapkey("gcs", "open chrome settings", function() {
    tabOpenLink("chrome://settings");
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Insert
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.Insert = {};

// TODO(hbt) ENHANCE add repeats support
mapkey("gi", "", CustomCommands.insertGoToFirstInput);
// TODO(hbt) ENHANCE send cursor position to ace editor
// TODO(hbt) ENHANCE add docker gvim server
amap("<Alt-i>", "open vim editor for current input");
imapkey("<Ctrl-i>", "open vim editor for current input", CustomCommands.insertOpenExternalEditor);
// amap("<Ctrl-i>", "open vim editor for current input");
// imapkey("<Alt-i>", "open vim editor for current input", CustomCommands.insertOpenExternalEditor);

amap("i", "go to edit box");
amap("I", "go to edit box with vim editor");
// TODO(hbt) INVESTIGATE diff between this and I above?
// amap("I", "NormalGo to edit box with vim editor");

imapkey(KeyboardUtils.encodeKeystroke("<Esc>"), "Exit insert mode", function() {
    getRealEdit().blur();
    Insert.exit();
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Omnibar
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.Omnibar = {};

// TODO(hbt) INVESTIGATE review omnibar shortcuts
amap("oo", "open a url in current tab");

amap("oh", "open url from history");
amap("ob", "open a bookmark");
amap("od", "open search with alias d");
addSearchAliasX(
    "j",
    "Google Javascript",
    "https://www.google.com/search?q=javascript ",
    "_",
    "https://www.google.com/complete/search?client=chrome-omni&gs_ri=chrome-ext&oit=1&cp=1&pgcl=7&q=javascript ",
    function(response) {
        var res = JSON.parse(response.text);
        return res[1];
    }
);
addSearchAliasX(
    "s",
    "Google Stackoverflow",
    "https://www.google.com/search?q=site%3Asuperuser.com+OR+site%3Astackoverflow.com ",
    "_",
    "https://www.google.com/complete/search?client=chrome-omni&gs_ri=chrome-ext&oit=1&cp=1&pgcl=7&q= ",
    function(response) {
        var res = JSON.parse(response.text);
        return res[1];
    }
);
addSearchAliasX(
    "u",
    "Google Ubuntu",
    "https://www.google.com/search?q=site%3Asuperuser.com+OR+site%3Aaskubuntu.com ",
    "_",
    "https://www.google.com/complete/search?client=chrome-omni&gs_ri=chrome-ext&oit=1&cp=1&pgcl=7&q=ubuntu ",
    function(response) {
        var res = JSON.parse(response.text);
        return res[1];
    }
);
addSearchAliasX(
    "m",
    "Google IMDB Movie",
    "https://www.google.com/search?q=imdb ",
    "_",
    "https://www.google.com/complete/search?client=chrome-omni&gs_ri=chrome-ext&oit=1&cp=1&pgcl=7&q=imdb ",
    function(response) {
        var res = JSON.parse(response.text);
        return res[1];
    }
);
mapkey("oi", "Search IMDB", function() {
    Front.openOmnibar({ type: "SearchEngine", extra: "m" });
});
mapkey("om", "Search IMDB", function() {
    Front.openOmnibar({ type: "SearchEngine", extra: "m" });
});
mapkey("os", "Search Stackoverflow", function() {
    Front.openOmnibar({ type: "SearchEngine", extra: "s" });
});
mapkey("oj", "Search Javascript", function() {
    Front.openOmnibar({ type: "SearchEngine", extra: "j" });
});
mapkey("ou", "Search Ubuntu", function() {
    Front.openOmnibar({ type: "SearchEngine", extra: "u" });
});
amap("og", "open search with alias g");

cmap("<Ctrl-j>", "<Tab>");
cmap("<Ctrl-k>", "<Shift-Tab>");

amap("oM", "open url from vim-like marks");

// disabled
// amap("ow", "open search with alias w");
// amap("oy", "open search with alias y");
// amap("on", "open chrome newtab");

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Visual
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.Visual = {};

// amap("v", "toggle visual mode");
amap("zv", "toggle visual mode");
amap("zx", "enter visual mode, and select whole element");
amap("zz", "enter visual mode, and select whole element");

amap("V", "restore visual mode");
amap("*", "find selected text in current page");
vunmap("q");

// Normal vim cmds still active

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Session Management
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.SessionManagement = {};

// TODO(hbt) FIXME add cmd to save session but not quit
// amap("ZZ", "save session and quit");
// amap("ZR", "restore last session");

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Search
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.Search = {};

amap("/", "find in current page");
amap("<Alt-n>", "next found text");
amap("N", "previous found text");

// Search Engines
amap("S", "Normal Search Selected sg");

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Downloads
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.Downloads = {};


// map xp pauseDownloads
// map xr resumeDownloads
// map xc cancelDownloads
// map xR restartLastDownload
// map xg acceptDangerDownloads
// map xy copyURLDownloads
// map gj hideDownloadsShelf
// map xh hideDownloadsShelf
// map xs exportSettings
// map xl openLastDownload
// map xo openLastDownload
mapkey("xl", "Download open last file", CustomCommands.downloadOpenLastFile);
mapkey("xs", "Download show last file", CustomCommands.downloadShowLastFile);

amap("gj", "close downloads shelf");

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Bookmarks
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.Bookmarks = {};

mapkey("bm", "mouseless", () => {
    CustomCommands.bookmarkToggle("mouseless");
});

mapkey("br", "remember", () => {
    CustomCommands.bookmarkToggle("remember");
});

mapkey("bl", "later", () => {
    CustomCommands.bookmarkToggle("later");
});

mapkey("bn", "netflix", () => {
    CustomCommands.bookmarkToggle("netflix");
});

mapkey("bf", "functionshub", () => {
    CustomCommands.bookmarkToggle("functionshub");
});

mapkey("bt", "tn", () => {
    CustomCommands.bookmarkToggle("tn");
});

// TODO(hbt) INVESTIGATE inv smart way to recognize url changes e.g http://tomtunguz.com/pricing-summary/ changed to https://tomtunguz.com/pricing-summary -- using https. Can the API open a URL from my bookmark and update it to whatever the new one is so it shows with a star

mapkey("BDl", "dump later", () => {
    CustomCommands.bookmarkDumpFolder('later');
});
mapkey("BLl", "load later", () => {
    CustomCommands.bookmarkLoadFolder('later');
});
mapkey("BDf", "dump functionshub", () => {
    CustomCommands.bookmarkDumpFolder('functionshub');
});
mapkey("BLf", "load functionshub", () => {
    CustomCommands.bookmarkLoadFolder('functionshub');
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Misc
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.Misc = {};

amap(":", "open commands");
amap("<F1>", "show usage");
amap("..", "repeat last action");
amap("<Ctrl-z>", "enter passthrough mode to temporarily suppress surfingkeys");
amap("v", "toggle visual mode");
mapkey("v", "Pass Single key", CustomCommands.passSingleKey);
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Disabled
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.Disabled = {};

// proxy
// amap("cp", "toggle proxy for current site");
// amap(";cp", "copy proxy info");
// amap(";ap", "apply proxy info from clipboard");
// amap("spa", "set proxy mode `always`");
// amap("spb", "set proxy mode `byhost`");
// amap("spd", "set proxy mode `direct`");
// amap("sps", "set proxy mode `system`");
// amap("spc", "set proxy mode `clear`");

// tts
// TODO(hbt) INVESTIGATE tts on linux? -- https://askubuntu.com/questions/761975/chromium-is-not-generating-voice
// amap("gr", "read selected text or text from clipboard");

// Tools
// amap(";s", "toggle pdf viewer from surfingkeys");
// amap(";q", "insert jquery library on current page");
// amap(";t", "translate selected text with google");
// amap(";dh", "delete history older than 30 days");
// amap(";db", "remove bookmark for current page");
// amap(";pf", "fill form with data from yf");
// amap(";pp", "paste html on current page");
// amap("<Ctrl-i>", "open chrome inspect");
// amap("sm", "preview markdown");
// amap("Q", "open omnibar for word translation");

// Settings
// amap(";pj", "restore settings data from clipboard");
// amap("ge", "edit settings");

// TODO(hbt) INVESTIGATE bring cvim focus
// amap(";w", "focus top window");
// TODO(hbt) INVESTIGATE how it fits with hints mouse out
// amap(";m", "mouse out last element");
// TODO(hbt) INVESTIGATE
// amap("sfr", "show failed web requests of current page");
// TODO(hbt) INVESTIGATE
// amap("sql", "show last action");

// TODO(hbt) INVESTIGATE why crashing?
// amap("ZQ", "normal search selected zq");

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Configuration by domain
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.DomainConfig = {};

// gmail
if (window.top.location.href.indexOf("mail.google.com") !== -1) {
    settings.digitForRepeat = false;
    settings.disabledDomainKeys = ["s", "w", "j", "k", "a", "d"];
    unmap("`");
}

// youtube
function ytmap() {
    if (window.top.location.href.indexOf("youtube.com/watch") !== -1) {
        let keys = ["j", "k", "l"];
        keys.forEach(k => {
            unmap(k);
        });
    } else {
        amap("j", "scroll down");
        amap("l", "scroll right");
        amap("k", "scroll up");
    }

    // tabUnmute
    RUNTIME("tabUnmute");
}

function netflix() {
    if (window.top.location.href.indexOf("netflix.com") !== -1) {
        RUNTIME("tabUnmute");
    }
}

document.addEventListener("surfingkeys:hbt:tabcomplete", function(evt) {
    ytmap();
    netflix();
    checkvist();
});

// github
if (window.top.location.href.indexOf("github.com") !== -1) {
    settings.disabledDomainKeys = ["s", "w", "j", "k"];
}

// checkvist
function checkvist() {
    // checkvist
    if (window.top.location.href.indexOf("checkvist.com") !== -1) {
        settings.digitForRepeat = false;
        settings.stealFocusOnLoad = false;
        let keys = ["j", "g", "m", "k", "l", "h", "a", "e", "c"];
        keys.forEach(k => {
            unmap(k);
        });
    }
}
checkvist();

// PMR
if (window.top.location.href.indexOf("hbtlabs.com") !== -1) {
    settings.disabledDomainKeys = ["s"];
    settings.stealFocusOnLoad = false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Private
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
mmconfig.Private = {};

mapkey("<F2>", "Open SurfingKeys README", function() {
    tabOpenLink("https://github.com/hbt/Surfingkeys");
});

mapkey("<F4>", "Open mouseless README", function() {
    tabOpenLink("https://github.com/hbt/mouseless");
});
