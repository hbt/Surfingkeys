import { dispatchSKEvent } from '../runtime.js';
import type { CommandAPI, NormalModule, HintsModule } from '../../../../@types/surfingkeys';

export default function registerFrames(
    api: CommandAPI,
    _clipboard: unknown,
    _insert: unknown,
    normal: unknown,
    hints: unknown,
    _visual: unknown,
    _front: unknown,
    _browser: unknown
): void {
    const nm = normal as NormalModule;
    const hn = hints as HintsModule;
    const { mapkey } = api;

    mapkey('w', {
        short: "Switch frames",
        unique_id: "cmd_frame_switch",
        feature_group: 2,
        category: "frames",
        description: "Switch focus between page frames and iframes",
        tags: ["frames", "iframe", "navigation"]
    }, function() {
        // ensure frontend ready so that ui related actions can be available in iframes.
        dispatchSKEvent('ensureFrontEnd');
        if (window === top) {
            hn.create("iframe", function(element) {
                const iframe = element as HTMLIFrameElement;
                iframe.scrollIntoView({
                    behavior: 'auto',
                    block: 'center',
                    inline: 'center'
                });
                nm.highlightElement(iframe);
                iframe.contentWindow!.focus();
            }).then((hintsTotal: number) => {
                if (hintsTotal === 0) {
                    nm.rotateFrame();
                }
            });
        } else {
            nm.rotateFrame();
        }
    });

    mapkey(';w', {
        short: "Focus top window",
        unique_id: "cmd_frame_focus_top",
        feature_group: 2,
        category: "frames",
        description: "Focus the top-level window from an iframe",
        tags: ["frames", "window", "focus"]
    }, function() {
        top!.focus();
    });
}
