/**
 * CDP Configuration Module
 *
 * Centralized configuration for Chrome DevTools Protocol testing.
 * Supports switching between live (visible browser) and headless modes
 * via environment variables.
 *
 * Usage:
 *   import { CDP_CONFIG } from './config/cdp-config';
 *   const url = `${CDP_CONFIG.endpoint}/json`;
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env file from project root
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

export interface CDPConfig {
    /** CDP port number (9222 for live, 9223 for headless) */
    port: number;

    /** CDP mode: 'live' or 'headless' */
    mode: 'live' | 'headless';

    /** CDP host (usually localhost) */
    host: string;

    /** Full HTTP endpoint: http://localhost:9222 */
    readonly endpoint: string;

    /** WebSocket endpoint: ws://localhost:9222 */
    readonly wsEndpoint: string;

    /** Check if running in headless mode */
    readonly isHeadless: boolean;

    /** Check if running in live mode */
    readonly isLive: boolean;
}

class CDPConfigImpl implements CDPConfig {
    public readonly port: number;
    public readonly mode: 'live' | 'headless';
    public readonly host: string;

    constructor() {
        // Parse port from environment, default to 9222 (live)
        this.port = parseInt(process.env.CDP_PORT || '9222', 10);

        // Parse mode from environment, default to 'live'
        const mode = (process.env.CDP_MODE || 'live').toLowerCase();
        if (mode !== 'live' && mode !== 'headless') {
            console.warn(`Invalid CDP_MODE: ${mode}. Defaulting to 'live'`);
            this.mode = 'live';
        } else {
            this.mode = mode as 'live' | 'headless';
        }

        // Parse host from environment, default to localhost
        this.host = process.env.CDP_HOST || 'localhost';

        // Validate configuration
        this.validate();
    }

    get endpoint(): string {
        return `http://${this.host}:${this.port}`;
    }

    get wsEndpoint(): string {
        return `ws://${this.host}:${this.port}`;
    }

    get isHeadless(): boolean {
        return this.mode === 'headless';
    }

    get isLive(): boolean {
        return this.mode === 'live';
    }

    private validate(): void {
        // Standard ports validation
        const standardPorts = [9222, 9223];
        if (!standardPorts.includes(this.port)) {
            console.warn(`Warning: Using non-standard CDP port ${this.port}`);
            console.warn(`Standard ports: ${standardPorts.join(', ')}`);
        }

        // Port range validation (for phase 2 parallel testing)
        if (this.port < 1024 || this.port > 65535) {
            throw new Error(`Invalid port: ${this.port}. Must be between 1024-65535`);
        }

        // Mode-port consistency check
        if (this.mode === 'live' && this.port === 9223) {
            console.warn('Warning: Live mode typically uses port 9222, but using 9223');
        }
        if (this.mode === 'headless' && this.port === 9222) {
            console.warn('Warning: Headless mode typically uses port 9223, but using 9222');
        }
    }

    /**
     * Display current configuration
     */
    public toString(): string {
        return `CDP Config: ${this.mode} mode on ${this.endpoint}`;
    }
}

// Export singleton instance
export const CDP_CONFIG = new CDPConfigImpl();

// Log configuration on import (helpful for debugging)
if (process.env.DEBUG_CDP_CONFIG) {
    console.log('[CDP Config]', CDP_CONFIG.toString());
}
