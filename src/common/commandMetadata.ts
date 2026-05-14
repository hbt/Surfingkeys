/**
 * Command Metadata Utilities
 *
 * Provides helper functions to handle both legacy string annotations
 * and new structured metadata objects for commands.
 *
 * Supports gradual migration from string-based to object-based annotation.
 */

import { MapKeyAnnotation } from '../../@types/surfingkeys';

export type Annotation = string | MapKeyAnnotation | string[] | null | undefined;

/**
 * Extract display string from annotation (legacy or structured)
 * @param {string|object|array} annotation - Annotation value (string, metadata object, or array from parseAnnotation)
 * @returns {string} Display string for UI
 */
function getAnnotationString(annotation: Annotation | unknown) {
    if (typeof annotation === 'string') {
        return annotation;
    }
    if (Array.isArray(annotation) && annotation.length > 0) {
        return annotation[0] as string;
    }
    if (annotation && typeof annotation === 'object' && !Array.isArray(annotation) && 'short' in annotation) {
        return (annotation as MapKeyAnnotation).short;
    }
    return "Unknown command";
}

/**
 * Extract metadata object from annotation
 * @param {string|object|array} annotation - Annotation value
 * @returns {object} Metadata object with safe defaults
 */
type AnnotationMetadata = { short: string; unique_id: string | null; category: string | null; description: string | null; tags: string[]; [key: string]: unknown };

function getAnnotationMetadata(annotation: Annotation | unknown): AnnotationMetadata {
    if (typeof annotation === 'object' && annotation !== null && !Array.isArray(annotation)) {
        return annotation as AnnotationMetadata;
    }
    // Legacy string or array: convert to minimal metadata
    const displayString = Array.isArray(annotation) && annotation.length > 0
        ? annotation[0]
        : (annotation || "Unknown command");
    return {
        short: displayString as string,
        unique_id: null,
        category: null,
        description: null,
        tags: []
    };
}

/**
 * Get unique command identifier for tracking
 * Persists across key remappings
 * @param {string|object} annotation - Annotation value
 * @param {string} fallbackKey - Key sequence as fallback
 * @returns {string} Unique command ID
 */
function getCommandId(annotation: Annotation | unknown, fallbackKey: string): string {
    const metadata = getAnnotationMetadata(annotation);
    return metadata.unique_id || fallbackKey;
}

export {
    getAnnotationString,
    getAnnotationMetadata,
    getCommandId
};
