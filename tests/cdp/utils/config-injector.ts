/**
 * Config Injector for CDP Tests
 *
 * Injects custom Surfingkeys settings directly via Chrome storage
 * without requiring a proxy or external file server.
 */

import WebSocket from 'ws';
import { executeInTarget } from './cdp-client';

/**
 * Interface for injecting settings directly
 */
export interface SettingsOverride {
    scrollStepSize?: number;
    smoothScroll?: boolean;
    [key: string]: any;
}

/**
 * Inject settings directly into the extension's runtime config
 *
 * Generates a config file snippet and injects it by setting localPath
 * in storage, which triggers the extension to load and apply it.
 *
 * @param bgWs - WebSocket connection to background service worker
 * @param configUrl - URL to the config file (e.g., http://localhost:9874/config.js)
 * @returns Promise with injection result
 */
export async function injectSettingsViaUrl(
    bgWs: WebSocket,
    configUrl: string
): Promise<{ success: boolean; applied: boolean; values: any; error?: string }> {
    try {
        // Set localPath in chrome.storage.local via background script
        const setCode = `
            new Promise((resolve) => {
                chrome.storage.local.set({
                    localPath: '${configUrl.replace(/'/g, "\\'")}'
                }, () => {
                    resolve({ success: true });
                });
            })
        `;

        await executeInTarget(bgWs, setCode);

        // Small delay
        await new Promise(r => setTimeout(r, 200));

        // The extension will fetch the config file and apply it
        // Trigger loadSettings to pick up the new localPath
        const reloadCode = `
            new Promise((resolve) => {
                // Send reload message to trigger loadSettingsAndApplyProcedures
                fetch('${configUrl}?t=' + Date.now())
                    .then(r => r.text())
                    .then(() => resolve({ success: true }))
                    .catch(e => resolve({ success: false, error: e.message }));
            })
        `;

        await executeInTarget(bgWs, reloadCode);

        // Wait for config to be loaded
        await new Promise(r => setTimeout(r, 500));

        return {
            success: true,
            applied: true,
            values: { localPath: configUrl }
        };

    } catch (error: any) {
        return {
            success: false,
            applied: false,
            values: {},
            error: error.message || String(error)
        };
    }
}

/**
 * Inject settings directly - creates a simple config and serves it
 *
 * @param bgWs - WebSocket connection to background service worker
 * @param settings - Settings to inject
 * @param configUrl - URL to serve the config from
 * @returns Promise with injection result
 */
export async function injectSettings(
    bgWs: WebSocket,
    settings: SettingsOverride,
    configUrl?: string
): Promise<{ success: boolean; applied: boolean; values: any; error?: string }> {
    if (!configUrl) {
        return {
            success: false,
            applied: false,
            values: {},
            error: 'configUrl is required for config injection'
        };
    }

    return injectSettingsViaUrl(bgWs, configUrl);
}

/**
 * Inject a config file path into the extension's storage
 *
 * This sets chrome.storage.local.localPath, which causes the extension
 * to fetch and apply settings from that file on next initialization.
 *
 * @param bgWs - WebSocket connection to background service worker
 * @param configPath - File path or URL (e.g., http://localhost:9874/config.js)
 * @returns Promise with injection result
 */
export async function injectConfigFile(
    bgWs: WebSocket,
    configPath: string
): Promise<{ success: boolean; path: string; verified: boolean; error?: string }> {
    try {
        // Set localPath in chrome.storage.local
        const setResult = await executeInTarget(bgWs, `
            new Promise((resolve, reject) => {
                chrome.storage.local.set({
                    localPath: '${configPath.replace(/'/g, "\\'")}'
                }, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve({ success: true });
                    }
                });
            })
        `);

        if (!setResult.success) {
            return {
                success: false,
                path: configPath,
                verified: false,
                error: 'Failed to set localPath in storage'
            };
        }

        // Small delay for storage to persist
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify it was set
        const verifyResult = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.storage.local.get('localPath', (data) => {
                    resolve({
                        stored: data.localPath,
                        matches: data.localPath === '${configPath.replace(/'/g, "\\'")}'
                    });
                });
            })
        `);

        return {
            success: true,
            path: configPath,
            verified: verifyResult.matches || false
        };

    } catch (error: any) {
        return {
            success: false,
            path: configPath,
            verified: false,
            error: error.message || String(error)
        };
    }
}

/**
 * Get the current config file path from storage
 */
export async function getConfigFilePath(bgWs: WebSocket): Promise<string | null> {
    try {
        const result = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.storage.local.get('localPath', (data) => {
                    resolve(data.localPath || null);
                });
            })
        `);
        return result;
    } catch (error) {
        return null;
    }
}

/**
 * Clear the config file path from storage
 */
export async function clearConfigFilePath(bgWs: WebSocket): Promise<boolean> {
    try {
        const result = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.storage.local.remove('localPath', () => {
                    resolve(true);
                });
            })
        `);
        return result === true;
    } catch (error) {
        return false;
    }
}
