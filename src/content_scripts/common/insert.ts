import Trie from './trie';
import { runtime } from './runtime.js';
import Mode from './mode';
import KeyboardUtils from './keyboardUtils';
import {
    getRealEdit,
    isEditable,
} from './utils.js';
import type { ModeConstructor, SKKeyboardEvent, TrieConstructor } from '../../../@types/surfingkeys';

function createInsert() {
    var self = new (Mode as unknown as ModeConstructor)("Insert");

    function moveCursorEOL() {
        var element = getRealEdit();
        if (element.setSelectionRange !== undefined) {
            try {
                element.setSelectionRange(element.value.length, element.value.length);
            } catch(err) {
                if (err instanceof DOMException && err.name === "InvalidStateError") {
                    // setSelectionRange does not apply
                } else {
                    throw err;
                }
            }
        } else if (isEditable(element)) {
            // for contenteditable div
            if (element.childNodes.length > 0) {
                var node = element.childNodes[element.childNodes.length -1];
                if (node.nodeType === Node.TEXT_NODE) {
                    document.getSelection()!.setPosition(node, (node as Text).data.length);
                } else {
                    let codeMirrorNode = (node as Element).querySelector(".CodeMirror-line");
                    if (codeMirrorNode) {
                        setEndOfContenteditable(element as HTMLElement);
                    } else {
                        document.getSelection()!.setPosition(node, node.childNodes.length);
                    }
                }
            }
        }
    }

    // From https://stackoverflow.com/questions/1125292/how-to-move-cursor-to-end-of-contenteditable-entity/69727327#69727327
    function setEndOfContenteditable(contentEditableElement: HTMLElement) {
        let range = document.createRange();//Create a range (a range is a like the selection but invisible)
        range.selectNodeContents(contentEditableElement);//Select the entire contents of the element with the range
        range.collapse(false);//collapse the range to the end point. false means collapse to end rather than the start
        let selection = window.getSelection()!;//get the selection object (allows you to change selection)
        selection.removeAllRanges();//remove any selections already made
        selection.addRange(range);//make the range you have just created the visible selection
    }

    self.mappings = new (Trie as unknown as TrieConstructor)();
    self.map_node = self.mappings;
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-e>"), {
        annotation: {
            short: "Move cursor to end",
            unique_id: "cmd_insert_cursor_end",
            category: "editing",
            description: "Move the cursor to the end of the line in input fields",
            tags: ["editing", "cursor", "insert"]
        },
        feature_group: 15,
        code: moveCursorEOL
    });
    const keyToBOL = KeyboardUtils.platform === "Windows" ? "<Ctrl-f>" : "<Ctrl-a>";
    self.mappings.add(KeyboardUtils.encodeKeystroke(keyToBOL), {
        annotation: "Move the cursor to the beginning of the line",
        feature_group: 15,
        code: function() {
            var element = getRealEdit();
            if (element.setSelectionRange !== undefined) {
                element.setSelectionRange(0, 0);
            } else {
                // for contenteditable div
                var selection = document.getSelection()!;
                selection.setPosition(selection.focusNode, 0);
            }
        }
    });
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-u>"), {
        annotation: {
            short: "Delete before cursor",
            unique_id: "cmd_insert_delete_before_cursor",
            category: "editing",
            description: "Delete all entered characters before the cursor in input fields",
            tags: ["editing", "delete", "insert"]
        },
        feature_group: 15,
        code: function() {
            var element = getRealEdit();
            if (element.setSelectionRange !== undefined) {
                element.value = element.value.substr(element.selectionStart ?? 0);
                element.setSelectionRange(0, 0);
            } else {
                // for contenteditable div
                var selection = document.getSelection()!;
                (selection.focusNode as unknown as { data: string }).data = (selection.focusNode as unknown as { data: string }).data.substr(selection.focusOffset);
            }
        }
    });
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Alt-b>"), {
        annotation: {
            short: "Move cursor backward word",
            unique_id: "cmd_insert_cursor_backward_word",
            category: "editing",
            description: "Move the cursor backward 1 word in input fields",
            tags: ["editing", "cursor", "insert", "vim"]
        },
        feature_group: 15,
        code: function() {
            var element = getRealEdit();
            if (element.setSelectionRange !== undefined) {
                var pos = nextNonWord(element.value, -1, element.selectionStart);
                element.setSelectionRange(pos, pos);
            } else {
                // for contenteditable div
                document.getSelection()!.modify("move", "backward", "word");
            }
        }
    });
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Alt-f>"), {
        annotation: {
            short: "Move cursor forward word",
            unique_id: "cmd_insert_cursor_forward_word",
            category: "editing",
            description: "Move the cursor forward 1 word in input fields",
            tags: ["editing", "cursor", "insert", "vim"]
        },
        feature_group: 15,
        code: function() {
            var element = getRealEdit();
            if (element.setSelectionRange !== undefined) {
                var pos = nextNonWord(element.value, 1, element.selectionStart);
                element.setSelectionRange(pos, pos);
            } else {
                // for contenteditable div
                document.getSelection()!.modify("move", "forward", "word");
            }
        }
    });
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Alt-w>"), {
        annotation: {
            short: "Delete word backwards",
            unique_id: "cmd_insert_delete_word_backward",
            category: "editing",
            description: "Delete a word backwards in input fields",
            tags: ["editing", "delete", "insert", "vim"]
        },
        feature_group: 15,
        code: function() {
            var element = getRealEdit();
            if (element.setSelectionRange !== undefined) {
                var pos = deleteNextWord(element.value, -1, element.selectionStart);
                element.value = pos[0];
                element.setSelectionRange(pos[1], pos[1]);
            } else {
                // for contenteditable div
                var selection = document.getSelection()!;
                var p0 = selection.focusOffset;
                document.getSelection()!.modify("move", "backward", "word");
                var v = (selection.focusNode as unknown as { data: string }).data, p1 = selection.focusOffset;
                (selection.focusNode as unknown as { data: string }).data = v.substr(0, p1) + v.substr(p0);
                selection.setPosition(selection.focusNode, p1);
            }
        }
    });
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Alt-d>"), {
        annotation: {
            short: "Delete word forwards",
            unique_id: "cmd_insert_delete_word_forward",
            category: "editing",
            description: "Delete a word forwards in input fields",
            tags: ["editing", "delete", "insert", "vim"]
        },
        feature_group: 15,
        code: function() {
            var element = getRealEdit();
            if (element.setSelectionRange !== undefined) {
                var pos = deleteNextWord(element.value, 1, element.selectionStart);
                element.value = pos[0];
                element.setSelectionRange(pos[1], pos[1]);
            } else {
                // for contenteditable div
                var selection = document.getSelection()!;
                var p0 = selection.focusOffset;
                document.getSelection()!.modify("move", "forward", "word");
                var v = (selection.focusNode as unknown as { data: string }).data, p1 = selection.focusOffset;
                (selection.focusNode as unknown as { data: string }).data = v.substr(0, p0) + v.substr(p1);
                selection.setPosition(selection.focusNode, p0);
            }
        }
    });
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Esc>"), {
        annotation: {
            short: "Exit insert mode",
            unique_id: "cmd_insert_exit",
            category: "vim",
            description: "Exit insert mode and return to normal mode",
            tags: ["insert", "vim", "mode"]
        },
        feature_group: 15,
        stopPropagation: function(key: string) {
            // return true only if bind key is not an ASCII key
            // so that imap(',,', "<Esc>") won't leave a comma in input
            return key.charCodeAt(0) < 256;
        },
        code: function() {
            getRealEdit().blur();
            self.exit();
        }
    });


    self.addEventListener('keydown', function(event: SKKeyboardEvent) {
        if (event.key && event.key.charCodeAt(0) > 127) {
            // IME is opened.
            event.sk_suppressed = true;
            return;
        }
        // prevent this event to be handled by Surfingkeys' other listeners
        var realTarget = getRealEdit(event);
        if (!isEditable(realTarget)) {
            self.exit();
        } else if (event.sk_keyName.length) {
            (Mode.handleMapKey as unknown as (this: unknown, event: SKKeyboardEvent, onNoMatched?: (last: { getPrefixWord(): string }) => void) => boolean).call(self, event, function(last: { getPrefixWord(): string }) {
                // for insert mode to insert unmapped chars with preceding chars same as some mapkeys
                // such as, to insert `,m` in case of mapkey `,,` defined.
                var pw = last.getPrefixWord();
                if (pw) {
                    var elm = getRealEdit(), str = elm.value, pos = elm.selectionStart;
                    if (str !== undefined && pos !== null && pos !== undefined) {
                        elm.value = str.substr(0, elm.selectionStart ?? 0) + pw + str.substr(elm.selectionEnd ?? 0);
                        pos += pw.length;
                        elm.setSelectionRange(pos, pos);
                    } else {
                        const sel = document.getSelection();
                        if (sel) {
                            var range = sel.getRangeAt(0);
                            var n = document.createTextNode(pw);
                            if ((sel as unknown as { type: string }).type === "Caret") {
                                const nodeData = (sel.focusNode as unknown as { data: string | undefined }).data;
                                if (nodeData === undefined) {
                                    range.insertNode(n);
                                    sel.setPosition(n, n.length);
                                } else {
                                    const fpos = sel.focusOffset;
                                    (sel.focusNode as unknown as { data: string }).data = nodeData.substr(0, fpos) + pw + nodeData.substr(fpos);
                                    sel.setPosition(sel.focusNode, fpos + pw.length);
                                }
                            } else {
                                range.deleteContents();
                                range.insertNode(n);
                                sel.setPosition(n, n.length);
                            }
                        }
                    }
                }
            });
        }
        event.sk_suppressed = true;
    });
    self.addEventListener('focus', function(event: SKKeyboardEvent) {
        var realTarget = getRealEdit(event);
        // We get a focus event with target = window when the browser window looses focus.
        // Ignore this event.
        if (event.target != window && !isEditable(realTarget)) {
            self.exit();
        } else {
            event.sk_suppressed = true;
        }
    });

    function nextNonWord(str: string, dir: number, cur: number | null) {
        var nonWord = /\W/;
        var pos = (cur ?? 0) + dir;
        for ( ; ; ) {
            if (pos < 0) {
                pos = 0;
                break;
            } else if (pos >= str.length) {
                pos = str.length;
                break;
            } else if (nonWord.test(str[pos])) {
                break;
            } else {
                pos = pos + dir;
            }
        }
        return pos;
    }

    function deleteNextWord(str: string, dir: number, cur: number | null) {
        var pos = nextNonWord(str, dir, cur);
        var curPos = cur ?? 0;
        var s = str;
        if (pos > curPos) {
            s = str.substr(0, curPos) + str.substr(pos);
        } else if (pos < curPos) {
            s = str.substr(0, pos) + str.substr(curPos);
        } else {
            s = str.substr(0, pos) + str.substr(pos + 1);
        }
        return [s, dir > 0 ? curPos: pos] as [string, number];
    }

    var _element: Element | null = null;
    var _enter = self.enter.bind(self);
    (self as unknown as { enter: (elm: Element, keepCursor?: boolean) => void }).enter = function(elm: Element, keepCursor?: boolean) {
        if (elm === document.body) {
            runtime.conf.showModeStatus = false;
        }
        var changed = (_enter.call(self, 0, true) === -1);
        if (_element !== elm) {
            _element = elm;
            changed = true;
        }
        if (changed && !keepCursor && runtime.conf.cursorAtEndOfInput && elm.nodeName !== 'SELECT') {
            moveCursorEOL();
        }
    };

    return self;
}

export default createInsert;
