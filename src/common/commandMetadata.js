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
 * @param {string|object|array} annotation - Annotation value (string, metadata object, or array from parseAnnotation)
 * @returns {string} Display string for UI
 */
function getAnnotationString(annotation) {
    if (typeof annotation === 'string') {
        return annotation;
    }
    if (Array.isArray(annotation) && annotation.length > 0) {
        return annotation[0];
    }
    if (annotation?.short) {
        return annotation.short;
    }
    return "Unknown command";
}

/**
 * Extract metadata object from annotation
 * @param {string|object|array} annotation - Annotation value
 * @returns {object} Metadata object with safe defaults
 */
function getAnnotationMetadata(annotation) {
    if (typeof annotation === 'object' && annotation !== null && !Array.isArray(annotation)) {
        return annotation;
    }
    // Legacy string or array: convert to minimal metadata
    const displayString = Array.isArray(annotation) && annotation.length > 0
        ? annotation[0]
        : (annotation || "Unknown command");
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
