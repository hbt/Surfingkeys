/**
 * Command Metadata Utilities
 *
 * Provides helper functions to handle both legacy string annotations
 * and new structured metadata objects for commands.
 *
 * Supports gradual migration from string-based to object-based annotation.
 */

/**
 * Extract display string from annotation (legacy or structured)
 * @param {string|object} annotation - Annotation value (string or metadata object)
 * @returns {string} Display string for UI
 */
function getAnnotationString(annotation) {
    if (typeof annotation === 'string') {
        return annotation;
    }
    if (annotation?.short) {
        return annotation.short;
    }
    return "Unknown command";
}

/**
 * Extract metadata object from annotation
 * @param {string|object} annotation - Annotation value
 * @returns {object} Metadata object with safe defaults
 */
function getAnnotationMetadata(annotation) {
    if (typeof annotation === 'object' && annotation !== null) {
        return annotation;
    }
    // Legacy string: convert to minimal metadata
    return {
        short: annotation || "Unknown command",
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
function getCommandId(annotation, fallbackKey) {
    const metadata = getAnnotationMetadata(annotation);
    return metadata.unique_id || fallbackKey;
}

export {
    getAnnotationString,
    getAnnotationMetadata,
    getCommandId
};
