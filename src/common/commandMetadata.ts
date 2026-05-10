/**
 * Command Metadata Utilities
 *
 * Provides helper functions to handle both legacy string annotations
 * and new structured metadata objects for commands.
 *
 * Supports gradual migration from string-based to object-based annotation.
 */

export interface CommandMetadata {
    short: string;
    unique_id: string | null;
    category: string | null;
    description: string | null;
    tags: string[];
    [key: string]: unknown;
}

export type Annotation = string | CommandMetadata | [string, ...unknown[]];

/**
 * Extract display string from annotation (legacy or structured)
 */
function getAnnotationString(annotation: Annotation): string {
    if (typeof annotation === 'string') {
        return annotation;
    }
    if (Array.isArray(annotation) && annotation.length > 0) {
        return annotation[0] as string;
    }
    if (!Array.isArray(annotation) && annotation?.short) {
        return annotation.short;
    }
    return "Unknown command";
}

/**
 * Extract metadata object from annotation
 */
function getAnnotationMetadata(annotation: Annotation): CommandMetadata {
    if (typeof annotation === 'object' && annotation !== null && !Array.isArray(annotation)) {
        return annotation as CommandMetadata;
    }
    // Legacy string or array: convert to minimal metadata
    const displayString = Array.isArray(annotation) && annotation.length > 0
        ? (annotation[0] as string)
        : ((annotation as string) || "Unknown command");
    return {
        short: displayString,
        unique_id: null,
        category: null,
        description: null,
        tags: []
    };
}

/**
 * Get unique command identifier for tracking
 * Persists across key remappings
 */
function getCommandId(annotation: Annotation, fallbackKey: string): string {
    const metadata = getAnnotationMetadata(annotation);
    return metadata.unique_id || fallbackKey;
}

export {
    getAnnotationString,
    getAnnotationMetadata,
    getCommandId
};
