import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as vm from 'vm';
import WebSocket from 'ws';
import { executeInTarget } from './cdp-client';
import { waitForConfigReady } from './browser-actions';

export interface HeadlessConfigSetOptions {
    bgWs: WebSocket;
    configPath: string;
    waitAfterSetMs?: number;  // Timeout for config registration (not arbitrary delay)
    ensureAdvancedMode?: boolean;
    localPathUrl?: string;
}

interface StorageSnapshot {
    snippetBytes: number;
    snippetHash: string | null;
    localPath: string | null;
    showAdvanced: boolean;
}

interface ValidationResult {
    fileExists: boolean;
    syntaxValid: boolean;
    fileSize: number;
    error?: string;
}

interface ImplementationResult {
    fileHash: string;
    storedPath: string;
}

interface PostValidationResult extends StorageSnapshot {
    hashMatches: boolean;
    pathMatches: boolean;
}

export interface HeadlessConfigSetResult {
    success: boolean;
    determine: {
        requestedPath: string;
        resolvedPath: string;
        localPathUrl: string;
    };
    contextBefore: StorageSnapshot;
    validate: ValidationResult;
    implementation?: ImplementationResult;
    postValidation?: PostValidationResult;
    error?: string;
}

function escapeForTemplateLiteral(content: string): string {
    return content
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$\{/g, '\\${');
}

async function readStorageSnapshot(bgWs: WebSocket): Promise<StorageSnapshot> {
    const snapshot = await executeInTarget(bgWs, `
        new Promise(async (resolve) => {
            chrome.storage.local.get(['snippets', 'localPath', 'showAdvanced'], async (data) => {
                const snippets = (typeof data.snippets === 'string') ? data.snippets : '';
                let snippetHash = null;
                if (snippets.length > 0) {
                    try {
                        const encoder = new TextEncoder();
                        const buffer = encoder.encode(snippets);
                        const digest = await crypto.subtle.digest('SHA-256', buffer);
                        snippetHash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
                    } catch (error) {
                        snippetHash = null;
                    }
                }

                resolve({
                    snippetBytes: snippets.length,
                    snippetHash,
                    localPath: data.localPath || null,
                    showAdvanced: Boolean(data.showAdvanced)
                });
            });
        })
    `);

    return snapshot as StorageSnapshot;
}

function validateJavaScript(source: string): { valid: boolean; error?: string } {
    try {
        new vm.Script(source);
        return { valid: true };
    } catch (error: any) {
        return { valid: false, error: error.message };
    }
}

export async function runHeadlessConfigSet(options: HeadlessConfigSetOptions): Promise<HeadlessConfigSetResult> {
    const {
        bgWs,
        configPath,
        waitAfterSetMs = 5000,  // Timeout (not delay) - waits for globalThis._isConfigReady()
        ensureAdvancedMode = true,
        localPathUrl
    } = options;

    const resolvedPath = path.isAbsolute(configPath)
        ? configPath
        : path.join(process.cwd(), configPath);
    const finalLocalPathUrl = localPathUrl || `file://${resolvedPath}`;
    const determine = {
        requestedPath: configPath,
        resolvedPath,
        localPathUrl: finalLocalPathUrl
    };

    const contextBefore = await readStorageSnapshot(bgWs);

    const validation: ValidationResult = {
        fileExists: false,
        syntaxValid: false,
        fileSize: 0
    };

    if (!fs.existsSync(resolvedPath)) {
        validation.error = `Config file not found: ${resolvedPath}`;
        return {
            success: false,
            determine,
            contextBefore,
            validate: validation,
            error: validation.error
        };
    }

    validation.fileExists = true;

    let fileContent = '';
    try {
        fileContent = fs.readFileSync(resolvedPath, 'utf-8');
        validation.fileSize = Buffer.byteLength(fileContent, 'utf-8');
    } catch (error: any) {
        validation.error = `Failed to read config: ${error.message}`;
        return {
            success: false,
            determine,
            contextBefore,
            validate: validation,
            error: validation.error
        };
    }

    const syntaxCheck = validateJavaScript(fileContent);
    validation.syntaxValid = syntaxCheck.valid;
    if (!syntaxCheck.valid) {
        validation.error = syntaxCheck.error;
        return {
            success: false,
            determine,
            contextBefore,
            validate: validation,
            error: syntaxCheck.error
        };
    }

    const fileHash = crypto.createHash('sha256').update(fileContent, 'utf-8').digest('hex');
    const escapedContent = escapeForTemplateLiteral(fileContent);
    const escapedPath = finalLocalPathUrl.replace(/'/g, "\\'");

    const storageFields = [
        `snippets: \`${escapedContent}\``,
        `localPath: '${escapedPath}'`
    ];

    if (ensureAdvancedMode) {
        storageFields.push('showAdvanced: true');
    }

    const setResult = await executeInTarget(bgWs, `
        new Promise((resolve, reject) => {
            chrome.storage.local.set({ ${storageFields.join(', ')} }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError.message || 'chrome.storage.local.set failed');
                } else {
                    resolve({ success: true });
                }
            });
        })
    `);

    if (!setResult || setResult.success !== true) {
        return {
            success: false,
            determine,
            contextBefore,
            validate: validation,
            error: 'Failed to persist config via chrome.storage.local'
        };
    }

    // Wait for config to be registered (signal-based, not arbitrary delay)
    if (waitAfterSetMs > 0) {
        await waitForConfigReady(bgWs, waitAfterSetMs);  // waitAfterSetMs now used as timeout, not delay
    }

    const postValidationSnapshot = await readStorageSnapshot(bgWs);
    const postValidation: PostValidationResult = {
        ...postValidationSnapshot,
        hashMatches: postValidationSnapshot.snippetHash === fileHash,
        pathMatches: postValidationSnapshot.localPath === finalLocalPathUrl
    };

    const success = postValidation.hashMatches && postValidation.pathMatches && (!ensureAdvancedMode || postValidation.showAdvanced);

    return {
        success,
        determine,
        contextBefore,
        validate: validation,
        implementation: {
            fileHash,
            storedPath: finalLocalPathUrl
        },
        postValidation,
        error: success ? undefined : 'Post-validation failed'
    };
}

export async function clearHeadlessConfig(bgWs: WebSocket): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve, reject) => {
            chrome.storage.local.set({
                snippets: '',
                localPath: '',
                showAdvanced: false
            }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError.message || 'Failed to clear config');
                } else {
                    resolve(true);
                }
            });
        })
    `);
}
