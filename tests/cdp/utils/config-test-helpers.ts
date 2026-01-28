import WebSocket from 'ws';
import { HeadlessConfigSetResult, runHeadlessConfigSet } from './config-set-headless';
import { createTab, findContentPage, connectToCDP, closeCDP, closeTab } from './cdp-client';
import { waitForSurfingkeysReady } from './browser-actions';

export interface ConfigPageContext {
    configResult: HeadlessConfigSetResult;
    tabId: number;
    pageWs: WebSocket;
    dispose: () => Promise<void>;
}

interface LoadConfigAndOpenPageOptions {
    bgWs: WebSocket;
    configPath: string;
    fixtureUrl: string;
    waitAfterSetMs?: number;
    ensureAdvancedMode?: boolean;
    activateTab?: boolean;
}

export async function loadConfigAndOpenPage(options: LoadConfigAndOpenPageOptions): Promise<ConfigPageContext> {
    const {
        bgWs,
        configPath,
        fixtureUrl,
        waitAfterSetMs = 3000,
        ensureAdvancedMode = true,
        activateTab = true
    } = options;

    const configResult = await runHeadlessConfigSet({
        bgWs,
        configPath,
        waitAfterSetMs,
        ensureAdvancedMode
    });

    if (!configResult.success) {
        throw new Error(`Failed to apply config ${configPath}: ${configResult.error || 'unknown error'}`);
    }

    const tabId = await createTab(bgWs, fixtureUrl, activateTab);
    const pageWsUrl = await findContentPage(fixtureUrl);
    const pageWs = await connectToCDP(pageWsUrl);

    await waitForSurfingkeysReady(pageWs);

    const dispose = async () => {
        await closeCDP(pageWs).catch(() => undefined);
        await closeTab(bgWs, tabId).catch(() => undefined);
    };

    return {
        configResult,
        tabId,
        pageWs,
        dispose
    };
}
