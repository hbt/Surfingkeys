import type { AnnotationObject } from './types';

// ============================================================================
// VALIDATION
// ============================================================================

export function validateAnnotation(annotation: string | AnnotationObject): {
    status: 'valid' | 'invalid' | 'not_migrated';
    errors: string[];
} {
    // String annotations are considered not migrated
    if (typeof annotation === 'string') {
        return {
            status: 'not_migrated',
            errors: ['Annotation is still a string, not migrated to object format']
        };
    }

    const errors: string[] = [];

    // Check required fields
    if (!annotation.short) {
        errors.push('Missing required field: short');
    }
    if (!annotation.unique_id) {
        errors.push('Missing required field: unique_id');
    }
    if (!annotation.category) {
        errors.push('Missing required field: category');
    }
    if (!annotation.description) {
        errors.push('Missing required field: description');
    }
    if (!annotation.tags || !Array.isArray(annotation.tags) || annotation.tags.length === 0) {
        errors.push('Missing required field: tags (must be a non-empty array)');
    }

    return {
        status: errors.length === 0 ? 'valid' : 'invalid',
        errors
    };
}
