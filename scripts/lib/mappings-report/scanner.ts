import * as fs from 'fs';
import * as path from 'path';
import type { MappingEntry } from './types';
import {
    parseMapkeyPatternsAST,
    parseMappingsAddPatternsAST,
    parseCommandPatternsAST,
    parseSearchAliasPatternsAST
} from './extractors';

// ============================================================================
// FILE SCANNER (mappings)
// ============================================================================

export function scanDirectory(dir: string, basePath: string, mappings: MappingEntry[]): void {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filepath = path.join(dir, file);
        const stat = fs.statSync(filepath);

        if (stat.isDirectory()) {
            scanDirectory(filepath, basePath, mappings);
        } else if (file.endsWith('.js') || file.endsWith('.ts')) {
            const content = fs.readFileSync(filepath, 'utf-8');
            const relPath = path.relative(basePath, filepath);

            // Parse all patterns using AST
            parseMapkeyPatternsAST(content, relPath, mappings);
            parseMappingsAddPatternsAST(content, relPath, mappings);
            parseCommandPatternsAST(content, relPath, mappings);
            parseSearchAliasPatternsAST(content, relPath, mappings);
        }
    }
}
