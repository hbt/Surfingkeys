import { RUNTIME } from '../content_scripts/common/runtime.js';
import {
    setSanitizedContent,
} from '../content_scripts/common/utils.js';
document.addEventListener("surfingkeys:defaultSettingsLoaded", function(evt) {
    const { normal, api } = (evt as CustomEvent).detail;

    const np  = new Promise((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore: neovim_lib.js is a runtime-only module without type declarations
        import(/* webpackIgnore: true */ './neovim_lib.js').then((nvimlib: { default: () => Promise<{ nvim: unknown; destroy: unknown }> }) => {
            nvimlib.default().then(({nvim, destroy}: { nvim: unknown; destroy: unknown }) => {
                void destroy;
                function rpc(data: unknown) {
                    const [ event, args ] = data as [string, string[]];
                    if (event === "Enter") {
                        if (args.length) {
                            normal.feedkeys(args[0]);
                        } else {
                            document.body.classList.add("neovim-disabled");
                            normal.enter();
                        }
                    }
                }
                const n = nvim as { on: (event: string, handler: unknown) => void; input: (key: string) => void; connect: (url: string) => void };
                n.on('nvim:open', () => {
                    n.input('<Esc>');
                    n.on('surfingkeys:rpc', rpc);
                });
                n.on('nvim:close', () => {
                    window.close();
                });
                resolve(nvim);
            });
        });
    });
    np.then((nvim) => {
        RUNTIME('connectNative', {mode: "standalone"}, (resp: { error?: string; url?: string }) => {
            if (resp.error) {
                setSanitizedContent(document.querySelector('#overlay'), resp.error);
                document.body.classList.add("neovim-disabled");
            } else {
                normal.exit();
                api.mapkey('<Alt-i>', {
                    short: 'Enable Neovim input',
                    unique_id: 'cmd_neovim_enable_input',
                    category: 'Neovim',
                    description: 'Enable Neovim input mode and remove the disabled state',
                    tags: ['neovim'],
                }, function() {
                    document.body.classList.remove("neovim-disabled");
                    normal.exit();
                });
                api.map('i', '<Alt-i>');
                const n = nvim as { connect: (url: string) => void };
                n.connect(resp.url!);
            }
        });
    });
});
