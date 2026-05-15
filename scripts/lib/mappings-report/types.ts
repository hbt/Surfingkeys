// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface AnnotationObject {
    short: string;
    unique_id: string;
    category: string;
    description: string;
    tags: string[]; // Must have at least one tag
}

export interface CategoryStats {
    total: number;          // all migrated mappings in this category
    has_test: number;       // mappings with at least one test
    missing: number;        // mappings with no test (= missing_ids.length)
    coverage_pct: number;   // has_test / total * 100, rounded to 1 decimal
    missing_ids: string[];  // sorted unique_ids with no test
}

export interface MappingEntry {
    key: string;
    mode: string;
    annotation: string | AnnotationObject;
    source: {
        file: string;
        line: number;
    };
    mappingType: 'mapkey' | 'direct' | 'search_alias' | 'command';
    handler_type?: 'inline' | 'named' | 'bound' | 'method' | 'uncaptured' | 'synthetic' | 'unknown';
    handler_name?: string;  // present when handler_type is named/bound/method
    mapping_options?: {
        feature_group?: number;
        repeatIgnore?: boolean;
        code?: any;
        stopPropagation?: any;
        [key: string]: any;  // Allow other discovered options
    };
    runtime_options?: {
        accepts_count: boolean;
    };
    validationStatus?: 'valid' | 'invalid' | 'not_migrated';
    validationErrors?: string[];
    test_coverage?: {
        hasTest: boolean;
        testFiles?: string[];
    };
    custom_mapping?: {
        hasMapping: boolean;
        mappings?: Array<{ key: string; type: string }>;
    };
    code_coverage?: {
        hasData: boolean;
        testCaseCount: number;
        targets: {
            content?: TargetStats;
            background?: TargetStats;
        };
    };
    relevant_coverage?: RelevantCoverage;
}

export interface Summary {
    total: number;
    by_mode: Record<string, number>;
    by_type: Record<string, number>;
    by_handler_type: Record<string, number>;
    migrated: number;
    not_migrated: number;
    validation: {
        valid: number;
        invalid: number;
        not_migrated: number;
    };
    // Configuration options discovery
    config_options: {
        [optionName: string]: {
            count: number;
            percentage: string;
            sample_values: any[];
        };
    };
    // Test coverage tracking
    tests?: {
        total_with_tests: number;
        total_without_tests: number;
        invalid_test_names: string[];
    };
    // Custom mapping coverage
    custom_mapping_coverage?: {
        mapped: number;
        unmapped: number;
    };
    code_coverage?: {
        with_data: number;
        without_data: number;
        content_only: number;
        background_only: number;
        both: number;
    };
}

export interface Issues {
    annotations: {
        invalid: Array<{ key: string; unique_id?: string; file: string; line: number; errors: string[] }>;
        not_migrated: Array<{ key: string; file: string; line: number }>;
    };
    tests: {
        missing: string[];          // unique_ids with no test file
        invalid_files: string[];    // test file names matching no known unique_id
        by_category: Record<string, CategoryStats>;
    };
    custom_mappings: {
        unmapped: string[];         // unique_ids with no entry in custom config
    };
    code_coverage: {
        missing: string[];          // unique_ids with hasData=false
        by_category: Record<string, CategoryStats>;
    };
    source_validation: {
        prefix_conflicts: Array<{
            mode: string;
            blocked_key: string;
            blocked_id: string | null;
            blocked_short: string;
            blocker_key: string;
            blocker_id: string | null;
            blocker_short: string;
        }>;
        g_placeholder_issues: Array<{
            type: 'duplicate' | 'gap' | 'wrong_start';
            key: string;
            message: string;
            affected_ids?: string[];
        }>;
    };
    config_validation: {
        prefix_conflicts: Array<{
            blocked_key: string;
            blocker_key: string;
            blocker_target: string;
        }>;
        invalid_mapcmdkey_targets: Array<{
            key: string;
            unique_id: string;
        }>;
        duplicate_keys: Array<{
            key: string;
            entries: Array<{ unique_id?: string; type: string; line?: number }>;
        }>;
    };
}

export interface SettingUsage {
    setting: string;           // e.g., "scrollStepSize"
    type: 'runtime.conf' | 'settings';
    file: string;
    line: number;
    functionName: string;      // Function where it's used
    context: 'read' | 'write'; // Whether it's being read or written
}

export interface SettingStats {
    setting: string;
    type: 'runtime.conf' | 'settings';
    count: number;
    files: Set<string>;
    functions: Set<string>;
    usages: SettingUsage[];
}

export interface ExcludedSetting {
    name: string;
    reason: string;
}

export interface SettingsAnnotation {
    short: string;
    unique_id: string;
    category: string;
    description: string;
    tags: string[];
    valueType: string;
    valueDescription?: string;
    values?: any[];
    default?: any;
}

export interface CustomConfigMapping {
    key: string;
    type: 'mapkey' | 'vmapkey' | 'imapkey' | 'cmapkey' | 'map' | 'unmap' | 'mapcmdkey';
    unique_id?: string;
    description?: string;
    line?: number;
}

export interface CustomConfiguration {
    summary: {
        total: number;
    };
    mappings: CustomConfigMapping[];
}

export interface Report {
    mappings: {
        summary: Summary;
        list: MappingEntry[];
    };
    settings: {
        summary: {
            total_usages: number;
            unique_settings: number;
            runtime_conf_settings: number;
            settings_api: number;
            excluded_count: number;
        };
        excluded: ExcludedSetting[];
        list: any[];
    };
    issues: Issues;
    custom_configuration?: CustomConfiguration;
}

export interface TargetStats {
    totalFunctions: number;
    coveredFunctions: number;
    pct: string;
    bySourceFile?: Record<string, { total: number; covered: number; pct: string }>;
}

export interface RelevantFunction {
    functionName: string;
    sourceFile: string | null;   // resolved via source map, e.g. "src/content_scripts/common/scroll.ts"
    deltaCount: number;          // count in command coverage minus baseline count (or full count if not in baseline)
}

export interface RelevantCoverageTarget {
    totalFunctions: number;      // functions after baseline subtraction
    bySourceFile: Record<string, {
        functions: RelevantFunction[];
        count: number;
    }>;
}

export interface RelevantCoverage {
    commandId: string;
    hasBaseline: boolean;        // whether a baseline was available for diffing
    baselineSource: 'probe' | 'derived' | 'none';  // how the baseline was obtained
    content: RelevantCoverageTarget | null;
    background: RelevantCoverageTarget | null;
}
