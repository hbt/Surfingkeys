import { AwsClient } from 'aws4fetch';

interface ParsedHeaders {
    [name: string]: string | number | boolean | Uint8Array | Date;
}

interface ParsedMessage {
    headers: ParsedHeaders;
    payload: unknown;
}

interface LLMOpts {
    onComplete: (message: Record<string, unknown>) => void;
    onChunk: (chunk: string) => void;
    model?: string;
}

interface LLMMessageContent {
    type: string;
    text?: string;
}

interface LLMMessageItem {
    role: string;
    content: string | LLMMessageContent[];
}

interface LLMRequest {
    messages: LLMMessageItem[];
    tools?: unknown;
}

class EventStreamParser {
    // https://smithy.io/2.0/aws/amazon-eventstream.html
    buffer: Uint8Array;
    constructor() {
        this.buffer = new Uint8Array(0);
    }

    /**
     * Parse an EventStream message from a Uint8Array or Buffer
     * @param {Uint8Array|Buffer} chunk - Raw binary data chunk
     * @returns {Array} Array of parsed messages
     */
    parse(chunk: Uint8Array | ArrayBuffer): ParsedMessage[] {
        const chunkArray = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        // Append new chunk to existing buffer
        const newBuffer = new Uint8Array(this.buffer.length + chunkArray.length);
        newBuffer.set(this.buffer);
        newBuffer.set(chunkArray, this.buffer.length);
        this.buffer = newBuffer;

        const messages: ParsedMessage[] = [];

        while (this.buffer.length >= 16) { // Minimum message size is 16 bytes
            // Read total length (4 bytes)
            const totalLength = this.readInt32(0);

            if (this.buffer.length < totalLength) {
                console.log(this.buffer.length, totalLength);
                break; // Wait for more data
            }

            // Read headers length (4 bytes)
            const headersLength = this.readInt32(4);

            // Parse headers
            const headers = this.parseHeaders(12, headersLength);

            // Calculate payload start and length
            const payloadStart = 12 + headersLength;
            const payloadLength = totalLength - headersLength - 16; // 16 = prelude (8) + checksum (4) + message checksum (4)

            // Extract payload
            const payload = this.buffer.slice(payloadStart, payloadStart + payloadLength);

            // Create message object
            const message: ParsedMessage = {
                headers,
                payload: this.decodePayload(payload, headers)
            };

            messages.push(message);

            // Remove processed message from buffer
            this.buffer = this.buffer.slice(totalLength);
        }

        return messages;
    }

    /**
     * Read a 32-bit integer from the buffer
     */
    readInt32(offset: number): number {
        return (this.buffer[offset] << 24) |
            (this.buffer[offset + 1] << 16) |
            (this.buffer[offset + 2] << 8) |
            this.buffer[offset + 3];
    }

    /**
     * Parse headers from the buffer
     */
    parseHeaders(start: number, length: number): ParsedHeaders {
        const headers: ParsedHeaders = {};
        let position = start;
        const end = start + length;

        while (position < end) {
            // Read header name length (1 byte)
            const nameLength = this.buffer[position++];

            // Read header name
            const name = new TextDecoder().decode(
                this.buffer.slice(position, position + nameLength)
            );
            position += nameLength;

            // Read header value type (1 byte)
            const type = this.buffer[position++];

            // Read header value length (2 bytes)
            const valueLength = (this.buffer[position] << 8) | this.buffer[position + 1];
            position += 2;

            // Read header value
            const value = this.parseHeaderValue(
                type,
                this.buffer.slice(position, position + valueLength)
            );
            position += valueLength;

            headers[name] = value;
        }

        return headers;
    }

    /**
     * Parse header value based on type
     */
    parseHeaderValue(type: number, data: Uint8Array): string | number | boolean | Uint8Array | Date {
        switch (type) {
            case 0: // boolean false
                return true;
            case 1: // boolean true
                return false;
            case 2: // byte
                return data[0];
            case 3: // short
                return (data[0] << 8) | data[1];
            case 4: // integer
                return (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
            case 5: // long
                // Note: JavaScript doesn't handle 64-bit integers well
                return Number(new BigInt64Array(data.buffer)[0]);
            case 6: // byte array
                return data;
            case 7: // string
                return new TextDecoder().decode(data);
            case 8: // timestamp
                return new Date(Number(new BigInt64Array(data.buffer)[0]));
            default:
                throw new Error(`Unknown header value type: ${type}`);
        }
    }

    /**
     * Decode payload based on content-type header
     */
    decodePayload(payload: Uint8Array, headers: ParsedHeaders): unknown {
        const contentType = headers[':content-type'];

        if (!contentType) {
            return payload;
        }

        if (contentType === 'application/json') {
            return JSON.parse(new TextDecoder().decode(payload));
        }

        if (typeof contentType === 'string' && contentType.startsWith('text/')) {
            return new TextDecoder().decode(payload);
        }

        return payload;
    }
}

interface BedrockFunction {
    (req: LLMRequest, opts: LLMOpts): void;
    init?: (opts: BedrockInitOpts) => void;
}

interface BedrockInitOpts {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    model?: string;
}

let awsClient: (AwsClient & { bedrockModel?: string }) | null = null;
const bedrock: BedrockFunction = function(req: LLMRequest, opts: LLMOpts) {
    if (!awsClient) {
        opts.onChunk("Please set up bedrock correctly.");
        opts.onComplete({});
        return;
    }

    function transformMessages(messages: LLMMessageItem[]) {
        return messages.map((m: LLMMessageItem) => {
            if (typeof(m.content) === "string") {
                return {"role": m.role, "content": [ {"type": "text", "text": m.content} ]};
            } else {
                return m;
            }
        });
    }

    const parser = new EventStreamParser();

    awsClient!.fetch(`https://bedrock-runtime.us-west-2.amazonaws.com/model/${awsClient!.bedrockModel}/invoke-with-response-stream`, {
        method: 'POST',
        headers: {
            "accept": "application/vnd.amazon.eventstream",
            "Content-Type": "application/json",
            "x-amzn-bedrock-accept": "*/*",
        },
        aws: {
            service: "bedrock",
        },
        body: JSON.stringify({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4096,
            "top_k": 250,
            "temperature": 1,
            "top_p": 0.999,
            "tools": req.tools,
            "system": req.messages[0].content,
            "messages": transformMessages(req.messages.slice(1))
        })
    }).then(response => {
        const reader = response.body!.getReader();

        let content_block: Record<string, unknown> = {};
        let message: Record<string, unknown> = {};
        function readStream() {
            reader.read().then(({done, value}) => {
                if (done) {
                    return;
                }

                // Convert the chunk to text
                const messages = parser.parse(value);
                for (var m of messages) {
                    const msgHeaders = m.headers as ParsedHeaders;
                    const msgPayload = m.payload as Record<string, unknown>;
                    if (msgHeaders[":message-type"] === "exception") {
                        opts.onChunk((msgPayload as { message: string }).message);
                        opts.onComplete({});
                    } else {
                        const e = JSON.parse(atob(msgPayload.bytes as string)) as Record<string, unknown>;
                        switch (e.type) {
                            case "message_start": {
                                const em = e.message as Record<string, unknown>;
                                message = { "role": em.role, "content": [] };
                                break;
                            }
                            case "content_block_start": {
                                const cb = e.content_block as Record<string, unknown>;
                                switch (cb.type) {
                                    case "text":
                                        content_block = cb;
                                        opts.onChunk(content_block.text as string);
                                        break;
                                    case "tool_use":
                                        content_block = cb;
                                        content_block.input_json = "";
                                        break;
                                }
                                break;
                            }
                            case "content_block_delta": {
                                const delta = e.delta as Record<string, unknown>;
                                switch (delta.type) {
                                    case "text_delta":
                                        opts.onChunk(delta.text as string);
                                        content_block.text = (content_block.text as string ?? '') + (delta.text as string);
                                        break;
                                    case "input_json_delta":
                                        content_block.input_json = (content_block.input_json as string ?? '') + (delta.partial_json as string);
                                        break;
                                }
                                break;
                            }
                            case "content_block_stop":
                                if (content_block.type === "tool_use") {
                                    content_block.input = JSON.parse(content_block.input_json as string);
                                    delete content_block.input_json;
                                }
                                (message.content as unknown[]).push(content_block);
                                break;
                            case "message_stop":
                                opts.onComplete(message);
                                break;
                        }
                    }
                }

                // Continue reading
                readStream();
            });
        }

        if (response.status == 200) {
            readStream();
        } else {
            reader.read().then(({value}) => {
                const err = new TextDecoder().decode(value);
                opts.onChunk(err);
                opts.onComplete({});
            });
        }
    }).catch(error => console.error('Error:', error));
};

bedrock.init = function(opts: BedrockInitOpts) {
    const clientOpts = {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
        sessionToken: opts.sessionToken,
    };
    awsClient = new AwsClient(clientOpts);
    awsClient.bedrockModel = opts.model;
};

interface OllamaFunction {
    (req: LLMRequest, opts: LLMOpts): void;
    model?: string;
}

const ollama: OllamaFunction = function(req: LLMRequest, opts: LLMOpts) {
    const decoder = new TextDecoder();

    fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        body: JSON.stringify({
            "model": ollama.model || 'qwen2.5-coder:32b',
            "tools": req.tools,
            "messages": req.messages
        })
    }).then(response => {
        const reader = response.body!.getReader();

        let toolCalls: unknown[] = [];
        let content = "";
        function readStream() {
            reader.read().then(({done, value}) => {
                if (done) {
                    return;
                }

                // Convert the chunk to text
                try {
                    const chunk = decoder.decode(value).trim();
                    for (const c of chunk.split("\n")) {
                        const o = JSON.parse(c) as Record<string, unknown>;
                        const omsg = o.message as Record<string, unknown>;
                        if (omsg.content) {
                            content += omsg.content as string;
                            opts.onChunk(omsg.content as string);
                        }
                        if (omsg.tool_calls) {
                            toolCalls.push(...(omsg.tool_calls as unknown[]));
                        }
                        if (o.done) {
                            omsg.content = (omsg.content as string) + content;
                            omsg.tool_calls = toolCalls;
                            opts.onComplete(omsg);
                        }
                    }
                } catch (e) {
                    console.error('Error in onChunk:', e, value);
                }

                // Continue reading
                readStream();
            });
        }

        if (response.status == 403) {
            opts.onChunk("403 Forbidden, please restart Ollama with `OLLAMA_ORIGINS=chrome-extension://*`.");
            opts.onComplete({});
        } else {
            readStream();
        }
    }).catch(error => console.error('Error:', error));
};

interface DeepseekFunction {
    (req: LLMRequest, opts: LLMOpts): void;
    apiKey?: string;
    model?: string;
}

const deepseek: DeepseekFunction = function(req: LLMRequest, opts: LLMOpts) {
    const decoder = new TextDecoder();
    if (!deepseek.apiKey) {
        opts.onChunk("Please set api key for DeepSeek correctly.");
        opts.onComplete({});
        return;
    }

    function transformMessages(reqMsgs: LLMMessageItem[]) {
        return reqMsgs.map((m: LLMMessageItem) => {
            if (typeof(m.content) === "string") {
                return m;
            } else {
                return {"role": m.role, "content": (m.content[0] as LLMMessageContent).text};
            }
        });
    }
    fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
            "Authorization": `Bearer ${deepseek.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            "model": deepseek.model || 'deepseek-chat',
            "stream": true,
            "messages": transformMessages(req.messages)
        })
    }).then(response => {
        const reader = response.body!.getReader();

        let content_block = { type: "text", text: "" };
        function readStream() {
            reader.read().then(({done, value}) => {
                if (done) {
                    return;
                }

                // Convert the chunk to text
                const chunk = decoder.decode(value);
                try {
                    const lines = chunk.trim().split("\n\n");
                    const dataPat = /^data: /;
                    for (const line of lines) {
                        if (!dataPat.test(line)) {
                            console.error('Unexpected line: ', line);
                            continue;
                        }
                        const data = line.replace(dataPat, "");
                        if (data === "[DONE]") {
                            opts.onComplete({role: "assistant", content: [content_block]});
                            return;
                        }
                        const o = JSON.parse(data) as Record<string, unknown>;
                        const choices = o.choices as Array<Record<string, unknown>>;
                        if (choices && (choices[0].delta as Record<string, unknown>)) {
                            const delta = choices[0].delta as Record<string, unknown>;
                            opts.onChunk(delta.content as string);
                            content_block.text += delta.content as string;
                        }
                    }
                } catch (e) {
                    console.error('Error parsing chunk:', e, value);
                }

                // Continue reading
                readStream();
            });
        }

        readStream();
    }).catch(error => console.error('Error:', error));
};

interface GeminiFunction {
    (req: LLMRequest, opts: LLMOpts): void;
    apiKey?: string;
}

// https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference
const gemini: GeminiFunction = function(req: LLMRequest, opts: LLMOpts) {
    const decoder = new TextDecoder();
    if (!gemini.apiKey) {
        opts.onChunk("Please set api key for Gemini correctly.");
        opts.onComplete({});
        return;
    }

    let model = opts.model || "gemini-2.0-flash";
    function buildParts(m: LLMMessageItem) {
        if (typeof(m.content) === "string") {
            return {"role": m.role, "parts": [ {"text": m.content} ]};
        } else {
            return {"role": m.role, "parts": [ {"text": (m.content[0] as LLMMessageContent).text} ]};
        }
    }
    function transformMessages(reqMsgs: LLMMessageItem[]) {
        const result: Record<string, unknown> = {};
        if (reqMsgs.length > 0 && reqMsgs[0].role === "system") {
            const text = reqMsgs[0].content;
            result.systemInstruction = { "parts": [ { text } ] };
            result.contents = reqMsgs.slice(1).map(buildParts);
        } else {
            result.contents = reqMsgs.map(buildParts);
        }
        return result;
    }

    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${gemini.apiKey}`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(transformMessages(req.messages))
    }).then(response => {
        const reader = response.body!.getReader();

        let buffer = "";
        let content_block = { type: "text", text: "" };
        function readStream() {
            reader.read().then(({done, value}) => {
                if (done) {
                    return;
                }

                // Convert the chunk to text
                const chunk = decoder.decode(value);
                try {
                    buffer += chunk;
                    if (buffer[0] !== "[") {
                        return readStream();
                    }
                    if (buffer[buffer.length - 1] === "]") {
                        const messages = JSON.parse(buffer) as Array<Record<string, unknown>>;
                        for (const o of messages) {
                            if (o.error && (o.error as Record<string, unknown>).message) {
                                opts.onChunk((o.error as Record<string, unknown>).message as string);
                                opts.onComplete({});
                                return;
                            }
                            if (o.candidates) {
                                const candidates = o.candidates as Array<Record<string, unknown>>;
                                if (candidates[0].content) {
                                    const parts = ((candidates[0].content as Record<string, unknown>).parts as Array<Record<string, unknown>>);
                                    opts.onChunk(parts[0].text as string);
                                    content_block.text += parts[0].text as string;
                                }
                                if (candidates[0].finishReason && candidates[0].finishReason === "STOP") {
                                    opts.onComplete({role: "assistant", content: [content_block]});
                                }
                            }
                        }
                        buffer = "";
                    }
                } catch (e) {
                    console.error('Error parsing chunk:', e, value);
                }

                // Continue reading
                readStream();
            });
        }

        readStream();
    }).catch(error => console.error('Error:', error));
};

interface CustomFunction {
    (req: LLMRequest, opts: LLMOpts): (() => void) | void;
    serviceUrl?: string;
    apiKey?: string;
    model?: string;
}

const custom: CustomFunction = function(req: LLMRequest, opts: LLMOpts) {
    const decoder = new TextDecoder();
    const abortCtrl = new AbortController();

    if (!custom.serviceUrl) {
        opts.onChunk('Please set service URL correctly.');
        opts.onComplete({});
        return;
    }
    if (!custom.apiKey) {
        opts.onChunk('Please set API key correctly.');
        opts.onComplete({});
        return;
    }
    if (!custom.model) {
        opts.onChunk('Please set model correctly.');
        opts.onComplete({});
        return;
    }

    const transformMessages = (msgs: LLMMessageItem[]) => msgs.map((m: LLMMessageItem) =>
        typeof m.content === 'string' ? m : { role: m.role, content: (m.content[0] as LLMMessageContent).text }
    );

    fetch(custom.serviceUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${custom.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: custom.model,
            stream: true,
            messages: transformMessages(req.messages),
        }),
        signal: abortCtrl.signal,
    })
        .then(resp => {
            const reader = resp.body!.getReader();
            let contentBlock = { type: 'text', text: '' };

            const readStream = () => {
                reader.read()
                    .then(({ done, value }) => {
                        if (done) {
                            return;
                        }
                        const chunk = decoder.decode(value);
                        try {
                            const lines = chunk.trim().split('\n\n');
                            const dataPat = /^data: /;
                            for (const line of lines) {
                                if (!dataPat.test(line)) {
                                    continue;
                                }
                                const data = line.replace(dataPat, '');
                                if (data === '[DONE]') {
                                    opts.onComplete({ role: 'assistant', content: [contentBlock] });
                                    return;
                                }
                                const o = JSON.parse(data) as Record<string, unknown>;
                                const choices = o.choices as Array<Record<string, unknown>> | undefined;
                                const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
                                if (delta?.content) {
                                    const txt = delta.content as string;
                                    opts.onChunk(txt);
                                    contentBlock.text += txt;
                                }
                            }
                        } catch (e) {
                            console.error('Error parsing chunk:', e);
                        }

                        readStream();
                    })
                    .catch(err => {
                        if ((err as Error).name !== 'AbortError') {
                            console.error('Stream error:', err);
                        }
                    });
            };

            readStream();
        })
        .catch(err => {
            if ((err as Error).name !== 'AbortError') {
                console.error('Fetch error:', err);
            }
        });

    return () => abortCtrl.abort();
};

export default {
    bedrock,
    deepseek,
    gemini,
    ollama,
    custom,
};
