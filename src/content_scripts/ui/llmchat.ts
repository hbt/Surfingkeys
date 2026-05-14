import CursorPrompt from '../common/cursorPrompt';
import { marked } from 'marked';
import { RUNTIME, runtime } from '../common/runtime.js';
import {
    createElementWithContent,
    hashString,
    setSanitizedContent,
    rotateInput,
} from '../common/utils.js';
import { LLMMessage } from '../../../@types/surfingkeys';

interface LLMChatSelf {
    prompt: string;
    omnibarPosition: string;
    onOpen(opts: Record<string, unknown>): void;
    onInput(): void;
    rotateInput(backward: boolean): void;
    onClose(): void;
    onTabKey(): void;
    onEnter(): boolean;
    resultsDiv?: Element;
    input?: HTMLInputElement;
    addDestroyListener?: (fn: () => void) => void;
}

interface OmnibarRef {
    resultsDiv: Element & { className: string; lastElementChild: Element | null };
    input: HTMLInputElement;
}

interface FrontRef {
    addDestroyListener(fn: () => void): void;
}

type LLMToolResult = LLMMessage | { content: unknown; role: string; tool_use_id?: string; is_error?: boolean; type?: string };

interface OllamaResponse {
    message: {
        tool_calls?: Array<{ function: { name: string; arguments: unknown } }>;
        content?: string | unknown[];
        [key: string]: unknown;
    };
    done?: boolean;
    chunk?: string;
}

interface BedrockContentItem {
    type: string;
    name?: string;
    input?: unknown;
    id?: string;
    text?: string;
}

export default function (omnibar: OmnibarRef, front: FrontRef) {
    const self: LLMChatSelf = {
        prompt: '🐝',
        omnibarPosition: "bottom",
        onOpen: function() {},
        onInput: function() {},
        rotateInput: function() {},
        onClose: function() {},
        onTabKey: function() {},
        onEnter: function() { return false; },
    };

    const RESERVED_MESSAGE_COUNT = 1;
    let messages: LLMMessage[] = [
        {
            "content": "",
            "role": "system"
        }
    ];
    let response = "";
    let provider = "";
    let providers: string[] = [];

    const dots = [ "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" ];
    let spinnerIndex = 0;
    let spinnerInterval: ReturnType<typeof setInterval> | 0 = 0;

    let userInput = "";
    let inputs: string[] = [];
    let curInputIdx = 0;

    const _tools = [
        {
            "name": "extract_links",
            "input_schema": {
                "required": [
                    "pattern"
                ],
                "properties": {
                    "pattern": {
                        "description": "pattern that matches the text on the links",
                        "type": "string"
                    }
                },
                "type": "object"
            },
            "description": "extract/find links on the page"
        }
    ];
    const toolImplementations: Record<string, (_params: unknown) => string> = {
        extract_links: (_params: unknown) => {
            return 'https://github.com/brookhong/Surfingkeys, https://brookhong.github.io/';
        }
    };

    const providerClients: Record<string, (resp: OllamaResponse) => boolean> = {
        "ollama": (resp: OllamaResponse) => {
            const toolResults: LLMToolResult[] = [];
            if (!resp.message.tool_calls) {
                return false;
            }
            for (const c of resp.message.tool_calls) {
                const toolResult = toolImplementations[c.function.name] ? toolImplementations[c.function.name](c.function.arguments) : `${c.function.name} not implemented.`;
                toolResults.push({
                    "content": toolResult,
                    "role": "tool"
                });
            }
            if (toolResults.length > 0) {
                messages.push(...(toolResults as LLMMessage[]));
                return true;
            }
            return false;
        },
        "bedrock": (resp: OllamaResponse) => {
            const toolResults: LLMToolResult[] = [];
            if (!resp.message.content) {
                return false;
            }
            const contentItems = resp.message.content as BedrockContentItem[];
            for (const c of contentItems) {
                if (c.type === "tool_use") {
                    const toolResult = (c.name && toolImplementations[c.name]) ? toolImplementations[c.name](c.input) : "not implemented.";
                    toolResults.push({
                        "tool_use_id": c.id ?? "",
                        "is_error": false,
                        "content": toolResult,
                        "type": "tool_result",
                        "role": "tool"
                    });
                }
            }
            if (toolResults.length > 0) {
                messages.push({
                    "content": toolResults as unknown as string,
                    "role": "user"
                });
                return true;
            }
            return false;
        },
    };
    function llmRequest(req: Record<string, unknown>, onChunk: (chunk: string) => void) {
        // req.tools = tools;
        if ((runtime as unknown as { bookMessage(evt: string, cb: (resp: OllamaResponse) => void): boolean }).bookMessage('llmResponse', (resp: OllamaResponse) => {
            if (resp.chunk) {
                onChunk(resp.chunk);
            } else if (resp.done) {
                let toolUsed = false;
                if (Object.keys(resp.message).length > 0) {
                    messages.push(resp.message as unknown as LLMMessage);
                    if (Object.prototype.hasOwnProperty.call(providerClients, provider)) {
                        toolUsed = providerClients[provider](resp);
                    }
                }
                if (toolUsed) {
                    req.messages = messages;
                    RUNTIME("llmRequest", req);
                } else {
                    (runtime as unknown as { releaseMessage(evt: string): void }).releaseMessage('llmResponse');
                }
            }
        })) {
            RUNTIME("llmRequest", req);
            return true;
        }
        return false;
    }

    function showSystemMessage(msg: string, duration: number) {
        const li = createElementWithContent('li', msg, { "class": "role-surfingkeys" });
        omnibar.resultsDiv.querySelector('ul')?.append(li);

        // Add fadeout animation after 3 seconds
        setTimeout(() => {
            (li as HTMLElement).style.transition = "opacity 1s";
            (li as HTMLElement).style.opacity = "0";
            li.addEventListener('transitionend', () => {
                li.remove();
            });
        }, duration);
    }

    const clear = () => {
        messages = messages.slice(0, RESERVED_MESSAGE_COUNT);
        hashString(currentUrl).then(hash => {
            localStorage.removeItem(hash);
        });
        omnibar.resultsDiv.querySelector('ul')?.remove();
        renderMessages();
    };
    const commands: Record<string, (arg?: string) => void> = {
        "system": (pmpt?: string) => {
            messages[0].content = pmpt ?? "";
        },
        "provider": (p?: string) => {
            if (p && providers.indexOf(p) !== -1) {
                clear();
                provider = p;
                const h4 = omnibar.resultsDiv.querySelector('h4');
                if (h4) h4.textContent = p;
            } else {
                const msg = `Please specify a provider, which can be [ ${providers.join(", ")} ].`;
                showSystemMessage(msg, 8000);
            }
        },
        "clearPromptHistory": () => {
            RUNTIME('updateInputHistory', {llmChat: []});
            inputs = [];
            curInputIdx = inputs.length;
        },
        "clear": clear,
    };
    const commandsPatten = new RegExp(`^/(${Object.keys(commands).join("|")})(?:\\s+(.+)|\\s*)?$`, "");
    const commandsPrompt = new CursorPrompt((c: unknown) => {
        return "<div>{0}</div>".format(c as string);
    }, (elm: Element) => {
        return (elm as HTMLElement).innerText;
    });

    function renderMessages() {
        function getReadableContent(content: unknown): string {
            if (typeof(content) === "string") {
                return content;
            } else {
                let readable = "";
                for (const c of (content as Array<{ type: string; text?: string }>)) {
                    if (c.type === "text") {
                        readable += c.text ?? "";
                    }
                }
                return readable;
            }
        }

        const readables: Array<{ role: string; content: string }> = [];
        let currentRole = "";
        for (const m of messages.slice(RESERVED_MESSAGE_COUNT)) {
            const content = getReadableContent(m.content);
            if (content === "") {
                continue;
            }
            if (m.role === currentRole) {
                readables[readables.length - 1].content += content;
            } else {
                readables.push({
                    role: m.role,
                    content
                });
                currentRole = m.role;
            }
        }

        const ul = createElementWithContent('ul');
        for (const m of readables) {
            if (m.role === "user") {
                ul.append(createElementWithContent('li', m.content, { "class": `role-${m.role}` }));
            } else {
                const li = createElementWithContent('li', "<div></div>", { "class": `role-${m.role}` });
                setSanitizedContent(li.firstElementChild, marked.parse(m.content));
                ul.append(li);
            }
        }
        omnibar.resultsDiv.append(ul);
        if (ul.lastElementChild) {
            ul.lastElementChild.scrollIntoView({ behavior: 'instant', block: 'end', });
        }
    }

    let currentUrl: string;
    self.onOpen = function(opts: Record<string, unknown>) {
        currentUrl = opts.url as string;
        hashString(currentUrl).then(hash => {
            let last = localStorage.getItem(hash);
            if (last) {
                messages = JSON.parse(last) as LLMMessage[];
            }

            messages[0].content = (opts && opts.system as string) || "";
            omnibar.resultsDiv.className = "llmChat";
            if (!provider) {
                provider = (opts && opts.provider as string) || runtime.conf.defaultLLMProvider;
            }
            omnibar.resultsDiv.append(createElementWithContent('h4', provider));
            renderMessages();

            userInput = "";
            RUNTIME('getSettings', {
                key: 'llmChatHistory'
            }, function(resp) {
                inputs = (resp.settings as { llmChatHistory: string[] }).llmChatHistory;
                curInputIdx = inputs.length;
            });
            RUNTIME('getAllLlmProviders', { }, function(resp) {
                providers = resp.providers as string[];
            });
        });
    };

    self.onInput = function() {
        userInput = omnibar.input.value;
        curInputIdx = inputs.length;
        if (userInput === "/") {
            commandsPrompt.activate(omnibar.input, Object.keys(commands));
        } else if (userInput[0] !== "/") {
            commandsPrompt.close();
        } else if (userInput === "/provider ") {
            commandsPrompt.activate(omnibar.input, providers);
        }
    };
    self.rotateInput = function(backward: boolean) {
        if (inputs.length > 0) {
            [omnibar.input.value, curInputIdx] = rotateInput(inputs, backward, curInputIdx, userInput);
        }
    };
    self.onClose = function() {
        omnibar.resultsDiv.className = "";
        commandsPrompt.close();
    };
    self.onTabKey = function() {
        const fi = omnibar.resultsDiv.querySelector('li.focused');
        if (fi && fi.classList.contains("role-user")) {
            omnibar.input.value = (fi as HTMLElement).innerText;
        }
    };

    let lastResponseItem: Element | null = null;
    self.onEnter = function() {
        const prompt = omnibar.input.value;
        if (!prompt) {
            return false;
        }

        RUNTIME('updateInputHistory', { llmChat: prompt }, (resp) => {
            inputs = resp.history as string[];
            curInputIdx = inputs.length;
        });
        const match = prompt.match(commandsPatten);
        if (match) {
            commands[match[1]](match[2]);
            userInput = "";
            omnibar.input.value = "";
            return false;
        }

        if (messages[messages.length - 1].content !== prompt || messages[messages.length - 1].role !== "user") {
            messages.push({ "content": prompt, "role": "user"});
        }
        if (llmRequest({ messages, provider }, onChunk)) {
            userInput = "";
            omnibar.input.value = "";
            response = "";
            omnibar.resultsDiv.lastElementChild?.append(createElementWithContent('li', prompt, { "class": "role-user" }));
            lastResponseItem = createElementWithContent('li', "<div></div>", { "class": "role-assistant" });
            omnibar.resultsDiv.lastElementChild?.append(lastResponseItem);
            spinnerIndex = 0;
            if (lastResponseItem?.firstElementChild) {
                (lastResponseItem.firstElementChild as HTMLElement).innerText = dots[spinnerIndex];
            }
            spinnerInterval = setInterval(() => {
                spinnerIndex = (spinnerIndex + 1) % dots.length;
                if (lastResponseItem?.firstElementChild) {
                    (lastResponseItem.firstElementChild as HTMLElement).innerText = dots[spinnerIndex];
                }
            }, 100);
        } else {
            const rejectedMsg = messages.pop();
            showSystemMessage(`Working on, be patient, rejecting: ${rejectedMsg?.content}`, 2000);
        }
        return false;
    };

    function onChunk(chunk: string) {
        if (spinnerInterval) {
            clearInterval(spinnerInterval);
            spinnerInterval = 0;
        }
        response = response + chunk;
        if (lastResponseItem?.firstElementChild) {
            setSanitizedContent(lastResponseItem.firstElementChild, marked.parse(response));
            lastResponseItem.firstElementChild.scrollIntoView({ behavior: 'instant', block: 'end', });
        }
    }

    front.addDestroyListener(() => {
        if (currentUrl && messages.length > 1) {
            hashString(currentUrl).then(hash => {
                localStorage.setItem(hash, JSON.stringify(messages));
            });
        }
    });
    return self;
};
