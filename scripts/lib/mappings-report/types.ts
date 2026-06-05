import type { Category } from '../../../@types/surfingkeys';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface AnnotationObject {
    short: string;
    unique_id: string;
    category: Category;
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
        excluded?: boolean;
        excludeReason?: string;
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
        note?: string;  // set for commands where low coverage is expected by design
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
        total_excluded: number;
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
        empty_key: Array<{ key: string; file: string; line: number }>;
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
    relevant_coverage: {
        /** Commands with a test but zero relevant functions captured on both targets.
         *  The test passes but exercises nothing — likely a timing or fixture issue. */
        dead_tests: string[];
        /** Commands with a test but fewer than 5 total relevant functions across both targets.
         *  The test runs but barely exercises the command's actual code paths. */
        thin_coverage: Array<{ id: string; content_fns: number; bg_fns: number }>;
    };
}

export interface SettingUsage {
    setting: string;           // e.g., "scrollStepSize"
    type: 'runtime.conf' | 'settings' | 'conf';
    file: string;
    line: number;
    functionName: string;      // Function where it's used
    context: 'read' | 'write'; // Whether it's being read or written
}

export interface SettingStats {
    setting: string;
    type: 'runtime.conf' | 'settings' | 'conf';
    process: 'background' | 'content_script' | 'pages' | 'mixed';
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
    hasDomain?: boolean;
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
            conf_settings: number;
            excluded_count: number;
        };
        excluded: ExcludedSetting[];
        list: any[];
    };
    issues: Issues;
    custom_configuration?: CustomConfiguration;
    last_test_run: LastTestRun;
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

// ============================================================================
// LAST TEST RUN TYPES
// ============================================================================

export type TestRunSummary = {
    runId: string;           // e.g. "2026-06-05T03-15-21-770Z-local"
    date: string;            // ISO 8601
    sha: string | null;      // 7-char git hash from filename
    host: string | null;     // os.hostname() injected by test-parallel
    stats: {
        passed: number;
        failed: number;
        flaky: number;
        skipped: number;
    };
    skipped_tests: Array<{ file: string; title: string }>;
    reportPath: string;
};

export type CoverageRunSummary = {
    runId: string;
    date: string;
    success: boolean;
    execution: 'local' | 'docker';
    stats: {
        passed: number;
        failed: number;
        flaky: number;
        skipped: number;
    } | null;           // null if linked report not found
    artifactCount: number;
    groupCount: number;
    manifestPath: string;
};

export type LastTestRun = {
    local: TestRunSummary | null;
    docker: TestRunSummary | null;
    coverage: {
        local: CoverageRunSummary | null;
        docker: CoverageRunSummary | null;
    };
    excluded_from_testing: {
        count: number;
        commands: Array<{ unique_id: string; reason: string }>;
    };
    skipped_tests: {
        // present when BOTH local + docker reports are available
        docker_only: { count: number; tests: Array<{ file: string; title: string }> };
        local_only:  { count: number; tests: Array<{ file: string; title: string }> };
        always:      { count: number; tests: Array<{ file: string; title: string }> };
    } | null;
};

export interface RelevantCoverage {
    commandId: string;
    hasBaseline: boolean;        // whether a baseline was available for diffing
    baselineSource: 'probe' | 'derived' | 'none';  // how the baseline was obtained
    content: RelevantCoverageTarget | null;
    background: RelevantCoverageTarget | null;
}
