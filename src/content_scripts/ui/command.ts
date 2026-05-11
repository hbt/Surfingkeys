import {
    createElementWithContent,
    showBanner,
    showPopup,
} from '../common/utils.js';
import { RUNTIME } from '../common/runtime.js';

export default (normal, command, omnibar) => {
    command('setProxy', {
        short: "Configure HTTP proxy settings",
        unique_id: "cmd_set_proxy",
        category: "proxy",
        description: "Set HTTP proxy with host:port and optional type (PROXY, SOCKS, etc). Usage: setProxy <proxy_host>:<proxy_port> [proxy_type|PROXY]",
        tags: ["proxy", "network", "configuration"]
    }, function(args) {
        // args is an array of arguments
        var proxy = ((args.length > 1) ? args[1] : "PROXY") + " " + args[0];
        RUNTIME('updateProxy', {
            proxy: proxy
        });
        return true;
    });

    command('setProxyMode', {
        short: "Set proxy mode",
        unique_id: "cmd_set_proxy_mode",
        category: "proxy",
        description: "Configure proxy behavior mode: always, direct, byhost, system, or clear. Usage: setProxyMode <always|direct|byhost|system|clear>",
        tags: ["proxy", "network", "mode"]
    }, function(args) {
        RUNTIME("updateProxy", {
            mode: args[0]
        }, function(rs) {
            if (["byhost", "always"].indexOf(rs.proxyMode) !== -1) {
                showBanner("{0}: {1}".format(rs.proxyMode, rs.proxy), 3000);
            } else {
                showBanner(rs.proxyMode, 3000);
            }
        });
        // return true to close Omnibar for Commands, false to keep Omnibar on
        return true;
    });

    command('listVoices', {
        short: "List text-to-speech voices",
        unique_id: "cmd_list_voices",
        category: "tts",
        description: "Display all available text-to-speech voices with their language, gender, and remote status",
        tags: ["tts", "voice", "list"]
    }, function() {
        RUNTIME('getVoices', null, function(response) {

            var voices = response.voices.map(function(s) {
                return `<tr><td>${s.voiceName}</td><td>${s.lang}</td><td>${s.gender}</td><td>${s.remote}</td></tr>`;
            });
            voices.unshift("<tr style='font-weight: bold;'><td>voiceName</td><td>lang</td><td>gender</td><td>remote</td></tr>");
            showPopup("<table style='width:100%'>{0}</table>".format(voices.join('')));
        });
    });
    command('testVoices', {
        short: "Test TTS voices",
        unique_id: "cmd_test_voices",
        category: "tts",
        description: "Test text-to-speech voices by locale and custom text. Usage: testVoices <locale> <text>",
        tags: ["tts", "voice", "test"]
    }, function(args) {
        RUNTIME('getVoices', null, function(response) {

            var voices = response.voices, i = 0;
            if (args.length > 0) {
                voices = voices.filter(function(v) {
                    return v.lang.indexOf(args[0]) !== -1;
                });
            }
            var textToRead = "This is to test voice with SurfingKeys";
            if (args.length > 1) {
                textToRead = args[1];
            }
            var text;
            for (i = 0; i < voices.length - 1; i++) {
                text = `${textToRead}, ${voices[i].voiceName} / ${voices[i].lang}.`;
                readText(text, {
                    enqueue: true,
                    verbose: true,
                    voiceName: voices[i].voiceName
                });
            }
            text = `${textToRead}, ${voices[i].voiceName} / ${voices[i].lang}.`;
            readText(text, {
                enqueue: true,
                verbose: true,
                voiceName: voices[i].voiceName,
                onEnd: function() {
                    showPopup("All voices test done.");
                }
            });
        });
    });
    command('stopReading', {
        short: "Stop text-to-speech reading",
        unique_id: "cmd_stop_reading",
        category: "tts",
        description: "Stop any currently active text-to-speech reading session",
        tags: ["tts", "stop", "control"]
    }, function(args) {
        RUNTIME('stopReading');
    });
    command('feedkeys', {
        short: "Feed keyboard mappings",
        unique_id: "cmd_feed_keys",
        category: "browser",
        description: "Execute a sequence of mapped keyboard commands programmatically",
        tags: ["keyboard", "mappings", "automation"]
    }, function(args) {
        normal.feedkeys(args[0]);
    });
    command('quit', {
        short: "Quit Chrome browser",
        unique_id: "cmd_quit_chrome",
        category: "browser",
        description: "Close all Chrome windows and quit the browser completely",
        tags: ["browser", "quit", "exit"]
    }, function() {
        RUNTIME('quit');
    });
    command('clearHistory', {
        short: "Clear input history",
        unique_id: "cmd_clear_history",
        category: "history",
        description: "Clear input history for specified context (find, cmd, etc). Usage: clearHistory <find|cmd|...>",
        tags: ["history", "clear", "privacy"]
    }, function(args) {
        let update = {};
        update[args[0]] = [];
        RUNTIME('updateInputHistory', update);
    });
    command('listSession', {
        short: "List saved sessions",
        unique_id: "cmd_list_session",
        category: "session",
        description: "Display all saved tab sessions in the omnibar for selection",
        tags: ["session", "tabs", "list"]
    }, function() {
        RUNTIME('getSettings', {
            key: 'sessions'
        }, function(response) {
            omnibar.listResults(Object.keys(response.settings.sessions), function(s) {
                return createElementWithContent('li', s);
            });
        });
    });
    command('createSession', {
        short: "Create tab session",
        unique_id: "cmd_create_session",
        category: "session",
        description: "Save current tabs as a named session for later restoration. Usage: createSession [name]",
        tags: ["session", "tabs", "save"]
    }, function(args) {
        RUNTIME('createSession', {
            name: args[0]
        });
    });
    command('deleteSession', {
        short: "Delete saved session",
        unique_id: "cmd_delete_session",
        category: "session",
        description: "Remove a saved tab session by name. Usage: deleteSession [name]",
        tags: ["session", "tabs", "delete"]
    }, function(args) {
        RUNTIME('deleteSession', {
            name: args[0]
        });
        return true; // to close omnibar after the command executed.
    });
    command('openSession', {
        short: "Open saved session",
        unique_id: "cmd_open_session",
        category: "session",
        description: "Restore tabs from a previously saved session by name. Usage: openSession [name]",
        tags: ["session", "tabs", "restore"]
    }, function(args) {
        RUNTIME('openSession', {
            name: args[0]
        });
    });
    command('listQueueURLs', {
        short: "List queued URLs",
        unique_id: "cmd_list_queue_urls",
        category: "queue",
        description: "Display all URLs currently in the queue waiting to be opened",
        tags: ["queue", "urls", "list"]
    }, function(args) {
        RUNTIME('getQueueURLs', null, function(response) {
            omnibar.listResults(response.queueURLs, function(s) {
                return createElementWithContent('li', s);
            });
        });
    });
    command('clearQueueURLs', {
        short: "Clear URL queue",
        unique_id: "cmd_clear_queue_urls",
        category: "queue",
        description: "Remove all URLs from the queue waiting to be opened",
        tags: ["queue", "urls", "clear"]
    }, function(args) {
        RUNTIME('clearQueueURLs');
    });
    command('createTabGroup', {
        short: "Group tabs by domain",
        unique_id: "cmd_create_tab_group",
        category: "tabs",
        description: "Organize all tabs by domain into a colored tab group. Usage: createTabGroup [title] [grey|blue|red|yellow|green|pink|purple|cyan|orange]",
        tags: ["tabs", "group", "organize"]
    }, function(args) {
        RUNTIME('createTabGroup', {title: args[0], color: args[1]});
    });
    command('timeStamp', {
        short: "Convert timestamp to readable format",
        unique_id: "cmd_time_stamp",
        category: "utility",
        description: "Convert a Unix timestamp to human-readable date and time format",
        tags: ["utility", "timestamp", "date"]
    }, function(args) {
        var dt = new Date(parseInt(args[0]));
        omnibar.listWords([dt.toString()]);
    });
};
