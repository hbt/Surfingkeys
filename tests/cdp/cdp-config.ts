/**
 * CDP Test Configuration
 *
 * Centralized configuration for CDP tests to support both
 * live browser (port 9222) and headless mode (dynamic port).
 *
 * Port Selection:
 * - If CDP_PORT environment variable is set, use that port
 * - Otherwise, default to 9222 (live browser)
 */

export const CDP_PORT = process.env.CDP_PORT ? parseInt(process.env.CDP_PORT, 10) : 9222;

export function getCDPUrl(path: string = ''): string {
    return `http://localhost:${CDP_PORT}${path}`;
}

export function getCDPJsonUrl(): string {
    return getCDPUrl('/json');
}

export function getCDPVersionUrl(): string {
    return getCDPUrl('/json/version');
}

export function getTestMode(): 'headless' | 'live' {
    return process.env.CDP_PORT ? 'headless' : 'live';
}

export function logTestConfig(): void {
    console.log(`CDP Configuration:`);
    console.log(`  Mode: ${getTestMode()}`);
    console.log(`  Port: ${CDP_PORT}`);
    console.log(`  CDP URL: ${getCDPUrl()}`);
    console.log();
}
