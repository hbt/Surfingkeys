#!/usr/bin/env bun
/**
 * Generate JSON report of all keyboard shortcuts in SurfingKeys (AST-based version)
 *
 * This script uses AST parsing with @babel/parser instead of regex to extract mappings.
 * It produces IDENTICAL JSON output to the regex-based mappings-json-report.ts script.
 *
 * Outputs structured JSON with:
 * - All keyboard mappings (mapkey, vmapkey, imapkey, etc.)
 * - Mode information (Normal, Visual, Insert, Omnibar, etc.)
 * - Annotations (both string and object formats preserved)
 * - Source file locations
 * - Summary statistics
 *
 * Usage: bun scripts/mappings-json-ast-report.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface AnnotationObject {
    short: string;
    unique_id: string;
    category: string;
    description: string;
    tags: string[]; // Must have at least one tag
}

interface MappingEntry {
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
            content?: {
                totalFunctions: number;
                coveredFunctions: number;
                pct: string;
            };
            background?: {
                totalFunctions: number;
                coveredFunctions: number;
                pct: string;
            };
        };
    };
}

interface Summary {
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

interface Issues {
    annotations: {
        invalid: Array<{ key: string; unique_id?: string; file: string; line: number; errors: string[] }>;
        not_migrated: Array<{ key: string; file: string; line: number }>;
    };
    tests: {
        missing: string[];          // unique_ids with no test file
        invalid_files: string[];    // test file names matching no known unique_id
    };
    custom_mappings: {
        unmapped: string[];         // unique_ids with no entry in custom config
    };
    code_coverage: {
        missing: string[];          // unique_ids with hasData=false
    };
}

interface SettingUsage {
    setting: string;           // e.g., "scrollStepSize"
    type: 'runtime.conf' | 'settings';
    file: string;
    line: number;
    functionName: string;      // Function where it's used
    context: 'read' | 'write'; // Whether it's being read or written
}

interface SettingStats {
    setting: string;
    type: 'runtime.conf' | 'settings';
    count: number;
    files: Set<string>;
    functions: Set<string>;
    usages: SettingUsage[];
}

interface ExcludedSetting {
    name: string;
    reason: string;
}

interface SettingsAnnotation {
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

interface CustomConfigMapping {
    key: string;
    type: 'mapkey' | 'vmapkey' | 'imapkey' | 'cmapkey' | 'map' | 'unmap';
    unique_id?: string;
    description?: string;
}

interface CustomConfiguration {
    summary: {
        total: number;
    };
    mappings: CustomConfigMapping[];
}

interface Report {
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

// ============================================================================
// FEATURE GROUP DESCRIPTIONS
// ============================================================================

/**
 * Maps feature_group indices to their human-readable category names
 * Used to categorize commands for display in the help menu
 */
const FEATURE_GROUP_DESCRIPTIONS: Record<number, string> = {
    0: 'Help',
    1: 'Mouse Click',
    2: 'Scroll Page / Element',
    3: 'Tabs',
    4: 'Page Navigation',
    5: 'Sessions',
    6: 'Search selected with',
    7: 'Clipboard',
    8: 'Omnibar',
    9: 'Visual Mode',
    10: 'vim-like marks',
    11: 'Settings',
    12: 'Chrome URLs',
    13: 'Proxy',
    14: 'Misc',
    15: 'Insert Mode',
    16: 'Lurk Mode',
    17: 'Regional Hints Mode'
};

// ============================================================================
// JSON SCHEMA
// ============================================================================

const REPORT_JSON_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "MappingsReport",
    "description": "Output schema for scripts/mappings-json-report.ts",
    "type": "object",
    "required": ["mappings", "settings", "issues"],
    "properties": {
        "mappings": {
            "type": "object",
            "description": "All keyboard mappings extracted from source files, with aggregate statistics and a flat list of entries",
            "required": ["summary", "list"],
            "properties": {
                "summary": { "$ref": "#/$defs/Summary" },
                "list": {
                    "type": "array",
                    "items": { "$ref": "#/$defs/MappingEntry" }
                }
            }
        },
        "settings": {
            "type": "object",
            "description": "Settings coverage report: usage statistics, exclusion list, and per-setting detail",
            "required": ["summary", "excluded", "list"],
            "properties": {
                "summary": {
                    "type": "object",
                    "required": ["total_usages", "unique_settings", "runtime_conf_settings", "settings_api", "excluded_count"],
                    "properties": {
                        "total_usages": { "type": "integer", "description": "Total number of individual setting accesses found across all source files, after excluded settings are filtered out" },
                        "unique_settings": { "type": "integer", "description": "Count of distinct setting names; multiple usages of the same setting count as one" },
                        "runtime_conf_settings": { "type": "integer", "description": "Number of unique settings accessed via runtime.conf.*" },
                        "settings_api": { "type": "integer", "description": "Number of unique settings accessed via settings.*" },
                        "excluded_count": { "type": "integer", "description": "Number of entries in the hardcoded EXCLUDED_SETTINGS list (false positives such as loop variables and built-in methods, filtered before counting)" }
                    }
                },
                "excluded": {
                    "type": "array",
                    "description": "Settings excluded from the report as false positives (loop variables, built-in methods, etc.)",
                    "items": { "$ref": "#/$defs/ExcludedSetting" }
                },
                "list": {
                    "type": "array",
                    "description": "One entry per unique setting name, sorted by usage frequency descending",
                    "items": { "$ref": "#/$defs/SettingEntry" }
                }
            }
        },
        "custom_configuration": {
            "$ref": "#/$defs/CustomConfiguration",
            "description": "Mappings parsed from the user's custom config file (~/.surfingkeys-2026.js); omitted if the file has no mappings"
        },
        "issues": {
            "$ref": "#/$defs/Issues",
            "description": "Actionable problem lists surfacing items that need attention; design principle: list=full data, summary=aggregate counts, issues=actionable problem lists"
        }
    },
    "$defs": {
        "AnnotationObject": {
            "type": "object",
            "description": "Structured annotation for a fully migrated mapping; replaces the legacy plain-string description",
            "required": ["short", "unique_id", "category", "description", "tags"],
            "properties": {
                "short": { "type": "string", "description": "Short human-readable label shown in the help menu" },
                "unique_id": { "type": "string", "description": "Stable snake_case machine identifier for this mapping, e.g. cmd_scroll_down" },
                "category": { "type": "string", "description": "Grouping category for help menu display" },
                "description": { "type": "string", "description": "Full description of what the mapping does" },
                "tags": {
                    "type": "array",
                    "description": "Non-empty list of topic tags used for filtering and search",
                    "items": { "type": "string" },
                    "minItems": 1
                }
            }
        },
        "MappingEntry": {
            "type": "object",
            "description": "A single keyboard mapping extracted from source files",
            "required": ["key", "mode", "annotation", "source", "mappingType"],
            "properties": {
                "key": { "type": "string", "description": "Key sequence that triggers this mapping, e.g. j, gT, ;e" },
                "mode": { "type": "string", "description": "Input mode this mapping belongs to: Normal, Visual, Insert, Omnibar, Command, or Hints" },
                "annotation": {
                    "description": "Description of the mapping — either a legacy plain string or a structured AnnotationObject",
                    "oneOf": [
                        { "type": "string" },
                        { "$ref": "#/$defs/AnnotationObject" }
                    ]
                },
                "source": {
                    "type": "object",
                    "description": "Source location where this mapping call appears",
                    "required": ["file", "line"],
                    "properties": {
                        "file": { "type": "string", "description": "Relative path from src/ to the file where this mapping is defined" },
                        "line": { "type": "integer", "description": "Line number in the source file where the mapping call begins" }
                    }
                },
                "mappingType": {
                    "type": "string",
                    "description": "How the mapping was registered: mapkey/vmapkey/imapkey/cmapkey call (mapkey), direct Trie add (direct), search alias expansion (search_alias), or command() call (command)",
                    "enum": ["mapkey", "direct", "search_alias", "command"]
                },
                "handler_type": {
                    "type": "string",
                    "description": "How the action function is supplied: inline (arrow/function expr), named (identifier ref), bound (.bind() call), method (member expression), uncaptured (no handler arg), synthetic (generated by addSearchAlias), unknown",
                    "enum": ["inline", "named", "bound", "method", "uncaptured", "synthetic", "unknown"]
                },
                "handler_name": { "type": "string", "description": "Name of the handler function; present when handler_type is named, bound, or method" },
                "mapping_options": {
                    "type": "object",
                    "description": "Raw options object from self.mappings.add() second argument (feature_group, repeatIgnore, etc.)",
                    "additionalProperties": true
                },
                "runtime_options": {
                    "type": "object",
                    "description": "Derived runtime behaviour flags",
                    "required": ["accepts_count"],
                    "properties": {
                        "accepts_count": { "type": "boolean", "description": "Whether this mapping accepts a numeric repeat prefix; false when repeatIgnore is set" }
                    }
                },
                "validationStatus": {
                    "type": "string",
                    "description": "Annotation validation result: valid (all fields present), invalid (missing fields or duplicate unique_id), not_migrated (still a plain string)",
                    "enum": ["valid", "invalid", "not_migrated"]
                },
                "validationErrors": {
                    "type": "array",
                    "description": "Validation error messages; present only when validationStatus is invalid or not_migrated",
                    "items": { "type": "string" }
                },
                "test_coverage": {
                    "type": "object",
                    "description": "Playwright test coverage for this mapping",
                    "required": ["hasTest"],
                    "properties": {
                        "hasTest": { "type": "boolean", "description": "Whether at least one Playwright test file references this mapping's unique_id" },
                        "testFiles": {
                            "type": "array",
                            "description": "Sorted list of test file names that cover this mapping",
                            "items": { "type": "string" }
                        }
                    }
                },
                "custom_mapping": {
                    "type": "object",
                    "description": "Cross-reference against the user's custom config file",
                    "required": ["hasMapping"],
                    "properties": {
                        "hasMapping": { "type": "boolean", "description": "Whether the user's custom config remaps or references this mapping's unique_id" },
                        "mappings": {
                            "type": "array",
                            "description": "Custom config entries that reference this mapping's unique_id",
                            "items": {
                                "type": "object",
                                "required": ["key", "type"],
                                "properties": {
                                    "key": { "type": "string", "description": "Key sequence used in the custom config entry" },
                                    "type": { "type": "string", "description": "Mapping function used in the custom config entry" }
                                }
                            }
                        }
                    }
                },
                "code_coverage": {
                    "type": "object",
                    "description": "V8 code coverage data collected by Playwright tests for this mapping",
                    "required": ["hasData", "testCaseCount", "targets"],
                    "properties": {
                        "hasData": { "type": "boolean", "description": "Whether any V8 coverage artifacts exist for this mapping's unique_id" },
                        "testCaseCount": { "type": "integer", "description": "Number of distinct test case directories found" },
                        "targets": {
                            "type": "object",
                            "description": "Per-target function coverage aggregated across all test cases",
                            "properties": {
                                "content": { "$ref": "#/$defs/TargetCoverage" },
                                "background": { "$ref": "#/$defs/TargetCoverage" }
                            }
                        }
                    }
                }
            }
        },
        "Summary": {
            "type": "object",
            "description": "Aggregate statistics for all mappings found across source files",
            "required": ["total", "by_mode", "by_type", "by_handler_type", "migrated", "not_migrated", "validation", "config_options"],
            "properties": {
                "total": { "type": "integer", "description": "Total number of mapping entries found" },
                "by_mode": { "type": "object", "description": "Count of mappings per input mode", "additionalProperties": { "type": "integer" } },
                "by_type": { "type": "object", "description": "Count of mappings per mappingType value", "additionalProperties": { "type": "integer" } },
                "by_handler_type": { "type": "object", "description": "Count of mappings per handler_type value", "additionalProperties": { "type": "integer" } },
                "migrated": { "type": "integer", "description": "Deprecated — equals validation.valid + validation.invalid. Mappings whose annotation has been converted to the structured AnnotationObject format" },
                "not_migrated": { "type": "integer", "description": "Deprecated — equals validation.not_migrated. Mappings still using a plain string annotation" },
                "validation": {
                    "type": "object",
                    "description": "Annotation validation counts",
                    "required": ["valid", "invalid", "not_migrated"],
                    "properties": {
                        "valid": { "type": "integer", "description": "Mappings with a fully valid AnnotationObject annotation" },
                        "invalid": { "type": "integer", "description": "Mappings with a structured annotation that fails validation (missing fields or duplicate unique_id)" },
                        "not_migrated": { "type": "integer", "description": "Mappings still using a plain string annotation" }
                    }
                },
                "config_options": {
                    "type": "object",
                    "description": "Per-option statistics for all mapping_options keys discovered across direct mappings",
                    "additionalProperties": { "$ref": "#/$defs/ConfigOption" }
                },
                "tests": {
                    "type": "object",
                    "description": "Playwright test coverage summary; omitted when test scan is skipped",
                    "required": ["total_with_tests", "total_without_tests", "invalid_test_names"],
                    "properties": {
                        "total_with_tests": { "type": "integer", "description": "Number of unique_ids with at least one matching Playwright test file" },
                        "total_without_tests": { "type": "integer", "description": "Number of unique_ids with no matching Playwright test file" },
                        "invalid_test_names": {
                            "type": "array",
                            "description": "Test file names that don't match any known unique_id or valid naming pattern",
                            "items": { "type": "string" }
                        }
                    }
                },
                "custom_mapping_coverage": {
                    "type": "object",
                    "description": "Coverage of built-in mappings by the user's custom config",
                    "required": ["mapped", "unmapped"],
                    "properties": {
                        "mapped": { "type": "integer", "description": "Number of unique_ids that appear in the user's custom config" },
                        "unmapped": { "type": "integer", "description": "Number of unique_ids with no custom config entry" }
                    }
                },
                "code_coverage": {
                    "type": "object",
                    "description": "Aggregate V8 code coverage presence across all mappings",
                    "required": ["with_data", "without_data", "content_only", "background_only", "both"],
                    "properties": {
                        "with_data": { "type": "integer", "description": "Mappings with any V8 coverage data" },
                        "without_data": { "type": "integer", "description": "Mappings with no V8 coverage data" },
                        "content_only": { "type": "integer", "description": "Mappings with content target coverage only" },
                        "background_only": { "type": "integer", "description": "Mappings with background target coverage only" },
                        "both": { "type": "integer", "description": "Mappings with both content and background coverage" }
                    }
                }
            }
        },
        "ConfigOption": {
            "type": "object",
            "description": "Usage statistics for a single mapping option key (e.g. feature_group, repeatIgnore)",
            "required": ["count", "percentage", "sample_values"],
            "properties": {
                "count": { "type": "integer", "description": "Number of mappings that include this option" },
                "percentage": { "type": "string", "description": "Percentage of all mappings that include this option, e.g. 12.5%" },
                "sample_values": { "type": "array", "description": "Up to 5 distinct values observed for this option" },
                "value_descriptions": {
                    "type": "object",
                    "description": "Human-readable labels for numeric option values; only present for feature_group",
                    "additionalProperties": { "type": "string" }
                }
            }
        },
        "ExcludedSetting": {
            "type": "object",
            "description": "A setting name excluded from the report as a detected false positive",
            "required": ["name", "reason"],
            "properties": {
                "name": { "type": "string", "description": "The setting name that was excluded" },
                "reason": { "type": "string", "description": "Explanation of why this name is a false positive and not a real setting" }
            }
        },
        "SettingEntry": {
            "type": "object",
            "description": "Aggregated usage data for a single setting name",
            "required": ["setting", "type", "frequency", "files", "functions", "usages"],
            "properties": {
                "setting": { "type": "string", "description": "The setting name, e.g. scrollStepSize" },
                "type": {
                    "type": "string",
                    "description": "Whether this setting is accessed via runtime.conf.* or settings.*",
                    "enum": ["runtime.conf", "settings"]
                },
                "frequency": { "type": "integer", "description": "Total number of individual accesses across all source files" },
                "files": { "type": "array", "description": "Sorted list of source files that reference this setting", "items": { "type": "string" } },
                "functions": { "type": "array", "description": "Sorted list of function names where this setting is accessed", "items": { "type": "string" } },
                "usages": {
                    "type": "array",
                    "description": "Full list of individual access locations",
                    "items": { "$ref": "#/$defs/SettingUsageDetail" }
                },
                "annotation": { "$ref": "#/$defs/SettingsAnnotation", "description": "Structured documentation loaded from docs/settings/all.json; omitted if not found" }
            }
        },
        "SettingsAnnotation": {
            "type": "object",
            "description": "Structured documentation for a setting, loaded from docs/settings/all.json",
            "required": ["short", "unique_id", "category", "description", "tags", "valueType"],
            "properties": {
                "short": { "type": "string", "description": "Short label for the setting" },
                "unique_id": { "type": "string", "description": "Stable identifier, e.g. setting_scrollStepSize" },
                "category": { "type": "string", "description": "Grouping category" },
                "description": { "type": "string", "description": "Full description of what the setting controls" },
                "tags": { "type": "array", "description": "Topic tags", "items": { "type": "string" } },
                "valueType": { "type": "string", "description": "JavaScript type of the value, e.g. number, string, boolean" },
                "valueDescription": { "type": "string", "description": "Human-readable description of valid values" },
                "values": { "type": "array", "description": "Enumerated valid values, if applicable" },
                "default": { "description": "Default value for this setting" }
            }
        },
        "SettingUsageDetail": {
            "type": "object",
            "description": "A single occurrence of a setting access in source",
            "required": ["file", "line", "function", "context"],
            "properties": {
                "file": { "type": "string", "description": "Relative path from src/ to the file containing this access" },
                "line": { "type": "integer", "description": "Line number of the access" },
                "function": { "type": "string", "description": "Name of the function containing this access" },
                "context": {
                    "type": "string",
                    "description": "Whether the setting is being read or written at this location",
                    "enum": ["read", "write"]
                }
            }
        },
        "CustomConfiguration": {
            "type": "object",
            "description": "Mappings extracted from the user's custom config file",
            "required": ["summary", "mappings"],
            "properties": {
                "summary": {
                    "type": "object",
                    "required": ["total"],
                    "properties": {
                        "total": { "type": "integer", "description": "Total number of mapping calls found in the custom config file" }
                    }
                },
                "mappings": {
                    "type": "array",
                    "description": "List of all mapping calls extracted from the custom config file",
                    "items": { "$ref": "#/$defs/CustomConfigMapping" }
                }
            }
        },
        "CustomConfigMapping": {
            "type": "object",
            "description": "A single mapping call from the user's custom config file",
            "required": ["key", "type"],
            "properties": {
                "key": { "type": "string", "description": "Key sequence being mapped" },
                "type": {
                    "type": "string",
                    "description": "Mapping function used: mapkey, vmapkey, imapkey, cmapkey, map, unmap, or mapcmdkey",
                    "enum": ["mapkey", "vmapkey", "imapkey", "cmapkey", "map", "unmap", "mapcmdkey"]
                },
                "unique_id": { "type": "string", "description": "unique_id of the built-in mapping being referenced; present for mapcmdkey variants" },
                "description": { "type": "string", "description": "Description extracted from the annotation argument; present when available" }
            }
        },
        "TargetCoverage": {
            "type": "object",
            "description": "Function coverage stats for one target (content or background)",
            "required": ["totalFunctions", "coveredFunctions", "pct"],
            "properties": {
                "totalFunctions": { "type": "integer", "description": "Total functions instrumented in this target" },
                "coveredFunctions": { "type": "integer", "description": "Functions with at least one execution (count > 0)" },
                "pct": { "type": "string", "description": "Coverage percentage string, e.g. \"88.2%\"" }
            }
        },
        "Issues": {
            "type": "object",
            "description": "Actionable problem lists — items that need attention, surfaced from all checks. Design principle: list=full data, summary=aggregate counts, issues=actionable problem lists",
            "required": ["annotations", "tests", "custom_mappings", "code_coverage"],
            "properties": {
                "annotations": {
                    "type": "object",
                    "description": "Annotation validation issues",
                    "required": ["invalid", "not_migrated"],
                    "properties": {
                        "invalid": {
                            "type": "array",
                            "description": "Mappings with a structured annotation that fails validation (missing fields or duplicate unique_id)",
                            "items": {
                                "type": "object",
                                "required": ["key", "file", "line", "errors"],
                                "properties": {
                                    "key": { "type": "string", "description": "Key sequence that triggers this mapping" },
                                    "unique_id": { "type": "string", "description": "unique_id from the annotation; present when the annotation is a structured object" },
                                    "file": { "type": "string", "description": "Relative path from src/ to the source file" },
                                    "line": { "type": "integer", "description": "Line number in the source file" },
                                    "errors": { "type": "array", "items": { "type": "string" }, "description": "Validation error messages" }
                                }
                            }
                        },
                        "not_migrated": {
                            "type": "array",
                            "description": "Mappings still using a plain string annotation instead of a structured AnnotationObject",
                            "items": {
                                "type": "object",
                                "required": ["key", "file", "line"],
                                "properties": {
                                    "key": { "type": "string", "description": "Key sequence that triggers this mapping" },
                                    "file": { "type": "string", "description": "Relative path from src/ to the source file" },
                                    "line": { "type": "integer", "description": "Line number in the source file" }
                                }
                            }
                        }
                    }
                },
                "tests": {
                    "type": "object",
                    "description": "Test coverage issues",
                    "required": ["missing", "invalid_files"],
                    "properties": {
                        "missing": {
                            "type": "array",
                            "description": "unique_ids of migrated mappings with no matching Playwright test file",
                            "items": { "type": "string" }
                        },
                        "invalid_files": {
                            "type": "array",
                            "description": "Test file names that don't match any known unique_id or valid naming pattern",
                            "items": { "type": "string" }
                        }
                    }
                },
                "custom_mappings": {
                    "type": "object",
                    "description": "Custom config coverage issues",
                    "required": ["unmapped"],
                    "properties": {
                        "unmapped": {
                            "type": "array",
                            "description": "unique_ids of migrated mappings with no entry in the user's custom config",
                            "items": { "type": "string" }
                        }
                    }
                },
                "code_coverage": {
                    "type": "object",
                    "description": "V8 code coverage issues",
                    "required": ["missing"],
                    "properties": {
                        "missing": {
                            "type": "array",
                            "description": "unique_ids of migrated mappings with no V8 coverage data (hasData=false)",
                            "items": { "type": "string" }
                        }
                    }
                }
            }
        }
    }
} as const;

// ============================================================================
// EXCLUSION LIST
// ============================================================================

/**
 * Settings that are false positives detected by the AST scanner.
 * These are not genuine configuration settings and should be excluded from reports.
 */
const EXCLUDED_SETTINGS: ExcludedSetting[] = [
    {
        name: 'hasOwnProperty',
        reason: 'Built-in JavaScript method used for property validation, not a configuration setting'
    },
    {
        name: 'k',
        reason: 'Loop variable in for...in iterations, not a literal property name (dynamic property access)'
    },
    {
        name: 'error',
        reason: 'Transient error message property for UI communication, not a user-configurable runtime setting'
    },
    {
        name: 'regexName',
        reason: 'Function parameter in ensureRegex() helper, not a configuration setting'
    }
];

// ============================================================================
// VALIDATION
// ============================================================================

function validateAnnotation(annotation: string | AnnotationObject): {
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

// ============================================================================
// MODE MAPPINGS
// ============================================================================

const MODE_MAP: Record<string, string> = {
    'mapkey': 'Normal',
    'vmapkey': 'Visual',
    'imapkey': 'Insert',
    'cmapkey': 'Omnibar',
    'command': 'Command'
};

// ============================================================================
// AST HELPER FUNCTIONS
// ============================================================================

/**
 * Helper function to get readable name from AST node
 */
function getNodeName(node: any): string {
    if (t.isIdentifier(node)) return node.name;
    if (t.isMemberExpression(node)) {
        const obj = getNodeName(node.object);
        const prop = t.isIdentifier(node.property) ? node.property.name : '<computed>';
        return `${obj}.${prop}`;
    }
    return '<expr>';
}

/**
 * Helper function to get call expression name
 */
function getCallExpressionName(callee: any): string {
    if (t.isIdentifier(callee)) {
        return callee.name;
    }
    if (t.isMemberExpression(callee)) {
        return getMemberExpressionName(callee);
    }
    return '<expr>';
}

/**
 * Helper function to get member expression name
 */
function getMemberExpressionName(node: any): string {
    if (t.isIdentifier(node.object) && t.isIdentifier(node.property)) {
        return `${node.object.name}.${node.property.name}`;
    }
    if (t.isMemberExpression(node.object)) {
        const objName = getMemberExpressionName(node.object);
        const propName = t.isIdentifier(node.property) ? node.property.name : '<computed>';
        return `${objName}.${propName}`;
    }
    if (t.isIdentifier(node.object)) {
        const propName = t.isIdentifier(node.property) ? node.property.name : '<computed>';
        return `${node.object.name}.${propName}`;
    }
    return '<expr>';
}

/**
 * Determine the handler implementation type from an AST node (e.g. `code:` property or args[2]).
 * Returns a structured descriptor used to populate handler_type and handler_name on MappingEntry.
 */
function extractHandlerType(node: any): { type: 'inline' | 'named' | 'bound' | 'method' | 'unknown'; name?: string } {
    if (!node) return { type: 'unknown' };
    const nodeType: string = node.type || '';

    // function() {} or () => {}
    if (nodeType === 'FunctionExpression' || nodeType === 'ArrowFunctionExpression') {
        return { type: 'inline' };
    }

    // moveCursorEOL
    if (nodeType === 'Identifier') {
        return { type: 'named', name: node.name };
    }

    // self.scroll.bind(self, "down") — check before plain MemberExpression
    if (nodeType === 'CallExpression') {
        const callee = node.callee;
        if (callee && callee.type === 'MemberExpression' && callee.property && callee.property.name === 'bind') {
            return { type: 'bound', name: getMemberExpressionName(callee.object) };
        }
    }

    // self.scroll (member expression, not a call)
    if (nodeType === 'MemberExpression') {
        return { type: 'method', name: getMemberExpressionName(node) };
    }

    return { type: 'unknown' };
}

/**
 * Extract the value from an AST node
 * Handles strings, numbers, booleans, objects, arrays, functions, call expressions, identifiers, and member expressions
 */
function extractValue(node: any): any {
    if (!node) return undefined;

    // Existing literal handling
    if (t.isStringLiteral(node)) return node.value;
    if (t.isNumericLiteral(node)) return node.value;
    if (t.isBooleanLiteral(node)) return node.value;
    if (t.isNullLiteral(node)) return null;

    if (t.isTemplateLiteral(node)) {
        if (node.expressions.length === 0 && node.quasis.length === 1) {
            return node.quasis[0].value.cooked;
        }
        return undefined;
    }

    if (t.isObjectExpression(node)) {
        const obj: any = {};
        for (const prop of node.properties) {
            if (t.isObjectProperty(prop) && !prop.computed) {
                let key: string;
                if (t.isIdentifier(prop.key)) {
                    key = prop.key.name;
                } else if (t.isStringLiteral(prop.key)) {
                    key = prop.key.value;
                } else if (t.isNumericLiteral(prop.key)) {
                    key = String(prop.key.value);
                } else {
                    continue;
                }
                obj[key] = extractValue(prop.value);
            }
        }
        return obj;
    }

    if (t.isArrayExpression(node)) {
        return node.elements.map((elem: any) => extractValue(elem)).filter((v: any) => v !== undefined);
    }

    // NEW: Handle function expressions
    if (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
        return '<Function>';
    }

    // NEW: Handle call expressions (e.g., bindScrollForHints("down"))
    if (t.isCallExpression(node)) {
        const calleeName = getCallExpressionName(node.callee);
        const args = node.arguments.map(arg => {
            const val = extractValue(arg);
            if (val !== undefined && typeof val !== 'object') {
                return JSON.stringify(val);
            }
            return '<expr>';
        }).join(', ');
        return `<CallExpression: ${calleeName}(${args})>`;
    }

    // NEW: Handle identifiers (variable references)
    if (t.isIdentifier(node)) {
        return `<Identifier: ${node.name}>`;
    }

    // NEW: Handle member expressions (e.g., self.scroll)
    if (t.isMemberExpression(node)) {
        const memberName = getMemberExpressionName(node);
        return `<MemberExpression: ${memberName}>`;
    }

    // NEW: Handle bind expressions (e.g., self.scroll.bind(self, "down"))
    if (t.isCallExpression(node) && t.isMemberExpression(node.callee)) {
        const member = node.callee;
        if (t.isIdentifier(member.property) && member.property.name === 'bind') {
            const target = getMemberExpressionName(member.object);
            const args = node.arguments.slice(1).map(arg => {
                const val = extractValue(arg);
                return val !== undefined && typeof val !== 'object' ? JSON.stringify(val) : '<expr>';
            }).join(', ');
            return `<BoundFunction: ${target}(${args})>`;
        }
    }

    return undefined;
}

// ============================================================================
// SETTINGS DETECTION HELPER FUNCTIONS
// ============================================================================

/**
 * Get the name of the function containing the current node
 */
function getContainingFunctionName(path: any): string {
    let current = path;

    while (current) {
        const node = current.node;

        // Check for function declaration: function foo() {}
        if (t.isFunctionDeclaration(node) && node.id) {
            return node.id.name;
        }

        // Check for method definition: obj.foo = function() {}
        if (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
            const parent = current.parent;

            // Assignment: foo = function() {}
            if (t.isAssignmentExpression(parent) && t.isIdentifier(parent.left)) {
                return parent.left.name;
            }

            // Object method: { foo: function() {} }
            if (t.isObjectProperty(parent) && t.isIdentifier(parent.key)) {
                return parent.key.name;
            }

            // Variable: const foo = function() {}
            if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
                return parent.id.name;
            }

            // Assignment to member: obj.foo = function() {}
            if (t.isAssignmentExpression(parent) && t.isMemberExpression(parent.left)) {
                const prop = parent.left.property;
                if (t.isIdentifier(prop)) {
                    return prop.name;
                }
            }
        }

        current = current.parentPath;
    }

    return '<anonymous>';
}

/**
 * Determine if this is a read or write access
 */
function getAccessContext(path: any): 'read' | 'write' {
    const parent = path.parent;

    // Check if this is on the left side of an assignment
    if (t.isAssignmentExpression(parent) && parent.left === path.node) {
        return 'write';
    }

    // Default to read
    return 'read';
}

/**
 * Detect settings usage in a file
 */
function detectSettingsInFile(filePath: string, relPath: string, usages: SettingUsage[]): void {
    const code = fs.readFileSync(filePath, 'utf-8');

    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript']
        });
    } catch (e) {
        // Silently skip files that can't be parsed
        return;
    }

    traverse(ast, {
        MemberExpression(path: any) {
            const node = path.node;

            // Check for runtime.conf.*
            if (t.isMemberExpression(node.object) &&
                t.isIdentifier(node.object.object, { name: 'runtime' }) &&
                t.isIdentifier(node.object.property, { name: 'conf' }) &&
                t.isIdentifier(node.property)) {

                usages.push({
                    setting: node.property.name,
                    type: 'runtime.conf',
                    file: relPath,
                    line: node.loc?.start.line || 0,
                    functionName: getContainingFunctionName(path),
                    context: getAccessContext(path)
                });
            }

            // Check for settings.*
            if (t.isIdentifier(node.object, { name: 'settings' }) &&
                t.isIdentifier(node.property)) {

                usages.push({
                    setting: node.property.name,
                    type: 'settings',
                    file: relPath,
                    line: node.loc?.start.line || 0,
                    functionName: getContainingFunctionName(path),
                    context: getAccessContext(path)
                });
            }
        }
    });
}

/**
 * Check if a node is a member expression matching a pattern
 * e.g., self.mappings.add or KeyboardUtils.encodeKeystroke
 */
function matchesMemberExpression(node: any, pattern: string[]): boolean {
    if (!t.isMemberExpression(node)) return false;

    const parts: string[] = [];
    let current = node;

    while (t.isMemberExpression(current)) {
        if (t.isIdentifier(current.property)) {
            parts.unshift(current.property.name);
        } else {
            return false;
        }
        current = current.object;
    }

    if (t.isIdentifier(current)) {
        parts.unshift(current.name);
    }

    return parts.join('.') === pattern.join('.');
}

// ============================================================================
// AST PATTERN EXTRACTORS
// ============================================================================

/**
 * Parse mapkey/vmapkey/imapkey/cmapkey patterns using AST
 */
function parseMapkeyPatternsAST(
    code: string,
    relPath: string,
    mappings: MappingEntry[]
): void {
    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['jsx']
        });
    } catch (e) {
        // Skip files that can't be parsed
        return;
    }

    const patterns = ['mapkey', 'vmapkey', 'imapkey', 'cmapkey'];

    traverse(ast, {
        CallExpression(path: any) {
            const callee = path.node.callee;

            // Check if it's one of the mapkey functions (direct or api.mapkey)
            let functionName: string | undefined;

            if (t.isIdentifier(callee)) {
                // Direct call: mapkey(...)
                functionName = callee.name;
            } else if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
                // Member call: api.mapkey(...) or self.mapkey(...)
                functionName = callee.property.name;
            }

            if (!functionName || !patterns.includes(functionName)) return;

            const args = path.node.arguments;
            if (args.length < 2) return;

            // Extract key (first argument)
            const key = extractValue(args[0]);
            if (typeof key !== 'string') return;

            // Extract annotation (second argument)
            const annotation = extractValue(args[1]);
            if (annotation === undefined) return; // Allow empty strings

            const lineNum = path.node.loc?.start.line || 0;
            const mode = MODE_MAP[functionName] || 'Normal';

            let handlerType: string = 'uncaptured';
            let handlerName: string | undefined;
            if (args.length >= 3 && args[2]) {
                const h = extractHandlerType(args[2]);
                handlerType = h.type;
                handlerName = h.name;
            }

            mappings.push({
                key,
                mode,
                annotation,
                source: { file: relPath, line: lineNum },
                mappingType: 'mapkey',
                handler_type: handlerType as MappingEntry['handler_type'],
                ...(handlerName !== undefined && { handler_name: handlerName })
            });
        }
    });
}

/**
 * Parse mode.mappings.add() patterns (direct Trie additions) using AST
 */
function parseMappingsAddPatternsAST(
    code: string,
    relPath: string,
    mappings: MappingEntry[]
): void {
    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['jsx']
        });
    } catch (e) {
        return;
    }

    traverse(ast, {
        CallExpression(path: any) {
            const callee = path.node.callee;

            // Check for self.mappings.add
            if (!matchesMemberExpression(callee, ['self', 'mappings', 'add'])) {
                return;
            }

            const args = path.node.arguments;
            if (args.length < 2) return;

            // Extract key - can be direct string or KeyboardUtils.encodeKeystroke(string)
            let key: string | undefined;
            const firstArg = args[0];

            if (t.isStringLiteral(firstArg)) {
                key = firstArg.value;
            } else if (t.isCallExpression(firstArg)) {
                // Check for KeyboardUtils.encodeKeystroke
                if (matchesMemberExpression(firstArg.callee, ['KeyboardUtils', 'encodeKeystroke'])) {
                    const encodedArg = firstArg.arguments[0];
                    if (t.isStringLiteral(encodedArg)) {
                        key = encodedArg.value;
                    }
                }
            }

            if (!key) return;

            // Extract the object (second argument)
            const objArg = args[1];
            if (!t.isObjectExpression(objArg)) return;

            // Extract properties from the options object
            let annotation: string | AnnotationObject | undefined;
            const mappingOptions: Record<string, any> = {};
            let handlerInfo: { type: 'inline' | 'named' | 'bound' | 'method' | 'unknown'; name?: string } | undefined;

            for (const prop of objArg.properties) {
                if (!t.isObjectProperty(prop) || prop.computed) continue;

                let propKey: string | undefined;
                if (t.isIdentifier(prop.key)) {
                    propKey = prop.key.name;
                } else if (t.isStringLiteral(prop.key)) {
                    propKey = prop.key.value;
                }

                if (!propKey) continue;

                if (propKey === 'annotation') {
                    annotation = extractValue(prop.value);
                } else if (propKey === 'code') {
                    // Preserve existing serialization
                    const value = extractValue(prop.value);
                    if (value !== undefined) {
                        mappingOptions[propKey] = value;
                    }
                    handlerInfo = extractHandlerType(prop.value);
                } else {
                    // All other properties are mapping options
                    const value = extractValue(prop.value);
                    if (value !== undefined) {
                        mappingOptions[propKey] = value;
                    }
                }
            }

            if (annotation === undefined) return; // Allow empty strings

            // Determine mode from file path
            let mode = 'Normal';
            if (relPath.includes('insert.js')) mode = 'Insert';
            else if (relPath.includes('visual.js')) mode = 'Visual';
            else if (relPath.includes('omnibar.js')) mode = 'Omnibar';
            else if (relPath.includes('hints.js')) mode = 'Hints';
            else if (relPath.includes('cursorPrompt.js')) mode = 'CursorPrompt';

            const lineNum = path.node.loc?.start.line || 0;

            // Derive runtime options from mapping options
            const runtimeOptions = {
                accepts_count: mappingOptions.repeatIgnore !== true
            };

            mappings.push({
                key,
                mode,
                annotation,
                source: { file: relPath, line: lineNum },
                mappingType: 'direct',
                ...(handlerInfo !== undefined && { handler_type: handlerInfo.type }),
                ...(handlerInfo?.name !== undefined && { handler_name: handlerInfo.name }),
                ...(Object.keys(mappingOptions).length > 0 ? { mapping_options: mappingOptions } : {}),
                runtime_options: runtimeOptions
            });
        }
    });
}

/**
 * Parse command() patterns using AST
 */
function parseCommandPatternsAST(
    code: string,
    relPath: string,
    mappings: MappingEntry[]
): void {
    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['jsx']
        });
    } catch (e) {
        return;
    }

    traverse(ast, {
        CallExpression(path: any) {
            const callee = path.node.callee;

            if (!t.isIdentifier(callee, { name: 'command' })) return;

            const args = path.node.arguments;
            if (args.length < 2) return;

            const name = extractValue(args[0]);
            const annotation = extractValue(args[1]);

            if (typeof name !== 'string') return;
            if (annotation === undefined) return;

            const lineNum = path.node.loc?.start.line || 0;

            let handlerType: string = 'uncaptured';
            let handlerName: string | undefined;
            if (args.length >= 3 && args[2]) {
                const h = extractHandlerType(args[2]);
                handlerType = h.type;
                handlerName = h.name;
            }

            mappings.push({
                key: name,
                mode: 'Command',
                annotation,
                source: { file: relPath, line: lineNum },
                mappingType: 'command',
                handler_type: handlerType as MappingEntry['handler_type'],
                ...(handlerName !== undefined && { handler_name: handlerName })
            });
        }
    });
}

/**
 * Parse addSearchAlias() patterns using AST and expand into individual mappings
 */
function parseSearchAliasPatternsAST(
    code: string,
    relPath: string,
    mappings: MappingEntry[]
): void {
    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['jsx']
        });
    } catch (e) {
        return;
    }

    traverse(ast, {
        CallExpression(path: any) {
            const callee = path.node.callee;

            if (!t.isIdentifier(callee, { name: 'addSearchAlias' })) return;

            const args = path.node.arguments;
            if (args.length < 4) return;

            const alias = extractValue(args[0]);
            const prompt = extractValue(args[1]);
            const searchUrl = extractValue(args[2]);
            const searchLeaderKey = extractValue(args[3]);

            if (typeof alias !== 'string' || typeof prompt !== 'string' ||
                typeof searchUrl !== 'string' || typeof searchLeaderKey !== 'string') {
                return;
            }

            const lineNum = path.node.loc?.start.line || 0;
            const annotation = `Search ${prompt}`;

            // Generate individual mappings created by addSearchAlias
            // 1. <searchLeaderKey><alias> - Search selected text
            mappings.push({
                key: `${searchLeaderKey}${alias}`,
                mode: 'Visual',
                annotation: `${annotation} (selected text)`,
                source: { file: relPath, line: lineNum },
                mappingType: 'search_alias',
                handler_type: 'synthetic'
            });

            // 2. o<alias> - Open omnibar for search
            mappings.push({
                key: `o${alias}`,
                mode: 'Normal',
                annotation: `${annotation} (omnibar)`,
                source: { file: relPath, line: lineNum },
                mappingType: 'search_alias',
                handler_type: 'synthetic'
            });

            // 3. <searchLeaderKey>o<alias> - Search only this site
            if (searchLeaderKey !== 's') {
                mappings.push({
                    key: `${searchLeaderKey}o${alias}`,
                    mode: 'Normal',
                    annotation: `${annotation} (this site only)`,
                    source: { file: relPath, line: lineNum },
                    mappingType: 'search_alias',
                    handler_type: 'synthetic'
                });
            }

            // 4. Uppercase variant if different from lowercase
            if (alias !== alias.toUpperCase()) {
                mappings.push({
                    key: `${searchLeaderKey}${alias.toUpperCase()}`,
                    mode: 'Visual',
                    annotation: `${annotation} (selected, uppercase variant)`,
                    source: { file: relPath, line: lineNum },
                    mappingType: 'search_alias',
                    handler_type: 'synthetic'
                });
            }
        }
    });
}

// ============================================================================
// FILE SCANNER
// ============================================================================

function scanDirectory(dir: string, basePath: string, mappings: MappingEntry[]): void {
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

function scanDirectoryForSettings(dir: string, basePath: string, usages: SettingUsage[]): void {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filepath = path.join(dir, file);
        const stat = fs.statSync(filepath);

        if (stat.isDirectory()) {
            // Skip node_modules and hidden directories
            if (file === 'node_modules' || file.startsWith('.')) {
                continue;
            }
            scanDirectoryForSettings(filepath, basePath, usages);
        } else if (file.endsWith('.js') || file.endsWith('.ts')) {
            const relPath = path.relative(basePath, filepath);
            detectSettingsInFile(filepath, relPath, usages);
        }
    }
}

// ============================================================================
// TEST COVERAGE TRACKING
// ============================================================================

/**
 * Scan the tests/playwright/commands directory for test files
 * Returns a map of test names (without .spec.ts extension) and their paths
 */
function scanTestFiles(projectRoot: string): Map<string, string> {
    const testDir = path.join(projectRoot, 'tests', 'playwright', 'commands');
    const testMap = new Map<string, string>();

    if (!fs.existsSync(testDir)) {
        return testMap;
    }

    const files = fs.readdirSync(testDir);
    for (const file of files) {
        if (file.endsWith('.spec.ts')) {
            // Extract test name without .spec.ts extension
            const testName = file.substring(0, file.length - 8); // Remove '.spec.ts'
            const testPath = path.join(testDir, file);
            testMap.set(testName, testPath);
        }
    }

    return testMap;
}

/**
 * Match test files with mapping entries and generate test coverage stats
 * Supports three test naming patterns:
 * 1. Direct mapping: cmd-scroll-down -> cmd_scroll_down (exact unique_id match)
 * 2. With setting: cmd-scroll-down.scrollStepSize -> tests cmd_scroll_down with scrollStepSize setting
 * 3. Qualifier variant: cmd-hints-link-background-tab.minimal -> variant test for cmd_hints_link_background_tab
 *
 * This function mutates the mappings array by adding test_coverage field to each mapping
 */
function generateTestCoverageStats(mappings: MappingEntry[], testMap: Map<string, string>, settingsUsages: SettingUsage[]): {
    total_with_tests: number;
    total_without_tests: number;
    invalid_test_names: string[];
} {
    const mappingsByUniqueId = new Map<string, MappingEntry>();

    // Build map of unique_ids
    for (const mapping of mappings) {
        if (typeof mapping.annotation === 'object' && mapping.annotation.unique_id) {
            // Handle duplicate unique_ids (they should exist)
            if (!mappingsByUniqueId.has(mapping.annotation.unique_id)) {
                mappingsByUniqueId.set(mapping.annotation.unique_id, mapping);
            }
        }
    }

    // Build set of valid setting names
    const validSettings = new Set<string>();
    for (const usage of settingsUsages) {
        validSettings.add(usage.setting);
    }

    // Build reverse map: unique_id -> test file names
    const uniqueIdToTests = new Map<string, string[]>();
    const invalidTestNames: string[] = [];

    for (const testName of testMap.keys()) {
        let isValid = false;

        // Try exact match first
        const normalizedTestName = testName.replace(/-/g, '_');
        if (mappingsByUniqueId.has(normalizedTestName)) {
            if (!uniqueIdToTests.has(normalizedTestName)) {
                uniqueIdToTests.set(normalizedTestName, []);
            }
            uniqueIdToTests.get(normalizedTestName)!.push(testName + '.spec.ts');
            isValid = true;
        } else {
            // Try pattern with last dot: cmd-scroll-down.scrollStepSize or cmd-foo.minimal
            const lastDotIndex = testName.lastIndexOf('.');
            if (lastDotIndex !== -1) {
                const commandPart = testName.substring(0, lastDotIndex);
                const normalizedCommandPart = commandPart.replace(/-/g, '_');

                if (mappingsByUniqueId.has(normalizedCommandPart)) {
                    if (!uniqueIdToTests.has(normalizedCommandPart)) {
                        uniqueIdToTests.set(normalizedCommandPart, []);
                    }
                    uniqueIdToTests.get(normalizedCommandPart)!.push(testName + '.spec.ts');
                    isValid = true;
                }
            }
        }

        if (!isValid) {
            // Test file exists but doesn't match any known pattern
            invalidTestNames.push(testName);
        }
    }

    // Add test_coverage field to each mapping
    for (const mapping of mappings) {
        if (typeof mapping.annotation === 'object' && mapping.annotation.unique_id) {
            const uid = mapping.annotation.unique_id;
            const testFiles = uniqueIdToTests.get(uid);

            if (testFiles && testFiles.length > 0) {
                mapping.test_coverage = {
                    hasTest: true,
                    testFiles: testFiles.sort()
                };
            } else {
                mapping.test_coverage = {
                    hasTest: false
                };
            }
        }
        // No test_coverage field for non-migrated or invalid mappings
    }

    // Count mappings with and without tests
    const totalMigratedWithValidIds = mappingsByUniqueId.size;
    const totalWithTests = uniqueIdToTests.size;
    const totalWithoutTests = totalMigratedWithValidIds - totalWithTests;

    return {
        total_with_tests: totalWithTests,
        total_without_tests: totalWithoutTests,
        invalid_test_names: invalidTestNames.sort()
    };
}

// ============================================================================
// CODE COVERAGE STATS
// ============================================================================

interface TargetStats {
    totalFunctions: number;
    coveredFunctions: number;
    pct: string;
}

function loadCoverageStats(uniqueId: string, coverageRawDir: string): {
    hasData: boolean;
    testCaseCount: number;
    targets: { content?: TargetStats; background?: TargetStats };
} {
    const idDir = path.join(coverageRawDir, uniqueId);
    if (!fs.existsSync(idDir)) {
        return { hasData: false, testCaseCount: 0, targets: {} };
    }

    // Collect all .v8.json files, grouped by target type and test case (first-level subdir)
    // Structure: <idDir>/<test_case>/<...>/<target_path>/<timestamp>.v8.json
    // Target is determined by path segment: "content" or "background"
    const contentFiles: Map<string, string[]> = new Map();
    const backgroundFiles: Map<string, string[]> = new Map();

    function walkDir(dir: string, testCaseKey: string): void {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fp = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walkDir(fp, testCaseKey);
            } else if (entry.name.endsWith('.v8.json')) {
                const rel = path.relative(idDir, fp);
                // Determine target from path segments
                if (rel.includes('/content/') || rel.startsWith('content/')) {
                    if (!contentFiles.has(testCaseKey)) contentFiles.set(testCaseKey, []);
                    contentFiles.get(testCaseKey)!.push(fp);
                } else if (rel.includes('/background/') || rel.startsWith('background/')) {
                    if (!backgroundFiles.has(testCaseKey)) backgroundFiles.set(testCaseKey, []);
                    backgroundFiles.get(testCaseKey)!.push(fp);
                }
            }
        }
    }

    // Each first-level subdir of idDir is a test case
    for (const entry of fs.readdirSync(idDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            walkDir(path.join(idDir, entry.name), entry.name);
        }
    }

    // Count distinct test cases (subdirs that have any v8.json)
    const allTestCaseDirs = new Set([...contentFiles.keys(), ...backgroundFiles.keys()]);
    const testCaseCount = allTestCaseDirs.size;

    if (testCaseCount === 0) {
        return { hasData: false, testCaseCount: 0, targets: {} };
    }

    // Helper: pick latest file per test case (sort by filename, take last)
    function pickLatest(filesMap: Map<string, string[]>): string[] {
        const result: string[] = [];
        for (const [, files] of filesMap) {
            const sorted = [...files].sort();
            result.push(sorted[sorted.length - 1]);
        }
        return result;
    }

    // Helper: parse V8 JSON and count functions
    function countFunctions(filePath: string): { total: number; covered: number } {
        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw);
            // V8 coverage format: array of script coverage objects
            const scripts: any[] = Array.isArray(data) ? data : (data.result ?? []);
            let total = 0;
            let covered = 0;
            for (const script of scripts) {
                const functions: any[] = script.functions ?? [];
                for (const fn of functions) {
                    total++;
                    const ranges: any[] = fn.ranges ?? [];
                    if (ranges.length > 0 && ranges[0].count > 0) {
                        covered++;
                    }
                }
            }
            return { total, covered };
        } catch {
            return { total: 0, covered: 0 };
        }
    }

    // Helper: aggregate stats across files
    function aggregateStats(files: string[]): TargetStats | undefined {
        if (files.length === 0) return undefined;
        let totalFunctions = 0;
        let coveredFunctions = 0;
        for (const f of files) {
            const { total, covered } = countFunctions(f);
            totalFunctions += total;
            coveredFunctions += covered;
        }
        const pct = totalFunctions > 0
            ? `${((coveredFunctions / totalFunctions) * 100).toFixed(1)}%`
            : '0.0%';
        return { totalFunctions, coveredFunctions, pct };
    }

    const contentLatest = pickLatest(contentFiles);
    const backgroundLatest = pickLatest(backgroundFiles);

    const targets: { content?: TargetStats; background?: TargetStats } = {};
    const contentStats = aggregateStats(contentLatest);
    if (contentStats) targets.content = contentStats;
    const backgroundStats = aggregateStats(backgroundLatest);
    if (backgroundStats) targets.background = backgroundStats;

    return { hasData: true, testCaseCount, targets };
}

function generateCoverageStats(mappings: MappingEntry[], coverageRawDir: string): {
    with_data: number;
    without_data: number;
    content_only: number;
    background_only: number;
    both: number;
} {
    let with_data = 0;
    let without_data = 0;
    let content_only = 0;
    let background_only = 0;
    let both = 0;

    for (const mapping of mappings) {
        const uniqueId = (mapping.annotation as any)?.unique_id;
        if (!uniqueId) continue;

        const stats = loadCoverageStats(uniqueId, coverageRawDir);
        mapping.code_coverage = {
            hasData: stats.hasData,
            testCaseCount: stats.testCaseCount,
            targets: stats.targets,
        };

        if (!stats.hasData) {
            without_data++;
        } else {
            with_data++;
            const hasContent = !!stats.targets.content;
            const hasBackground = !!stats.targets.background;
            if (hasContent && hasBackground) both++;
            else if (hasContent) content_only++;
            else if (hasBackground) background_only++;
        }
    }

    return { with_data, without_data, content_only, background_only, both };
}

// ============================================================================
// CUSTOM MAPPING COVERAGE
// ============================================================================

/**
 * Cross-reference built-in mappings against custom config mappings by unique_id.
 * Mutates mappings in place (same pattern as generateTestCoverageStats).
 * Returns summary counts.
 */
function generateCustomMappingStats(mappings: MappingEntry[], customConfig: CustomConfiguration): {
    mapped: number;
    unmapped: number;
} {
    // Build map: unique_id -> list of custom config entries that reference it
    const uidToCustomMappings = new Map<string, Array<{ key: string; type: string }>>();

    for (const cm of customConfig.mappings) {
        if (cm.unique_id) {
            if (!uidToCustomMappings.has(cm.unique_id)) {
                uidToCustomMappings.set(cm.unique_id, []);
            }
            uidToCustomMappings.get(cm.unique_id)!.push({ key: cm.key, type: cm.type });
        }
    }

    let mapped = 0;
    let unmapped = 0;

    // Track unique_ids already counted to avoid double-counting duplicate entries
    const countedUids = new Set<string>();

    for (const mapping of mappings) {
        if (typeof mapping.annotation !== 'object' || !mapping.annotation.unique_id) {
            continue;
        }

        const uid = mapping.annotation.unique_id;
        const customMappings = uidToCustomMappings.get(uid);

        if (customMappings && customMappings.length > 0) {
            mapping.custom_mapping = { hasMapping: true, mappings: customMappings };
            if (!countedUids.has(uid)) {
                mapped++;
                countedUids.add(uid);
            }
        } else {
            mapping.custom_mapping = { hasMapping: false };
            if (!countedUids.has(uid)) {
                unmapped++;
                countedUids.add(uid);
            }
        }
    }

    return { mapped, unmapped };
}

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

/**
 * Generate settings statistics from usages
 */
function generateSettingsStatistics(usages: SettingUsage[], annotationsMap: Map<string, SettingsAnnotation>): any {
    const excludedNames = new Set(EXCLUDED_SETTINGS.map(e => e.name));

    // Filter out excluded settings
    const filteredUsages = usages.filter(usage => !excludedNames.has(usage.setting));

    const statsMap = new Map<string, SettingStats>();

    for (const usage of filteredUsages) {
        const key = `${usage.type}.${usage.setting}`;

        if (!statsMap.has(key)) {
            statsMap.set(key, {
                setting: usage.setting,
                type: usage.type,
                count: 0,
                files: new Set(),
                functions: new Set(),
                usages: []
            });
        }

        const stat = statsMap.get(key)!;
        stat.count++;
        stat.files.add(usage.file);
        stat.functions.add(usage.functionName);
        stat.usages.push(usage);
    }

    // Convert to array and sort by frequency
    const settingsList = Array.from(statsMap.values()).sort((a, b) => b.count - a.count);

    return {
        summary: {
            total_usages: filteredUsages.length,
            unique_settings: settingsList.length,
            runtime_conf_settings: settingsList.filter(s => s.type === 'runtime.conf').length,
            settings_api: settingsList.filter(s => s.type === 'settings').length,
            excluded_count: EXCLUDED_SETTINGS.length
        },
        excluded: EXCLUDED_SETTINGS,
        list: settingsList.map(stat => {
            // Try to find annotation for this setting
            const annotation = annotationsMap.get(`setting_${stat.setting}`) ||
                              annotationsMap.get(stat.setting);

            return {
                setting: stat.setting,
                type: stat.type,
                frequency: stat.count,
                files: Array.from(stat.files).sort(),
                functions: Array.from(stat.functions).sort(),
                usages: stat.usages.map(u => ({
                    file: u.file,
                    line: u.line,
                    function: u.functionName,
                    context: u.context
                })),
                ...(annotation && { annotation })
            };
        })
    };
}

/**
 * Generate configuration options report by discovering all properties
 * from mapping_options across all mappings
 */
function generateConfigOptionsReport(mappings: MappingEntry[]): Record<string, any> {
    const configStats: Record<string, { count: number; values: Set<any> }> = {};

    for (const mapping of mappings) {
        if (!mapping.mapping_options) continue;

        for (const [key, value] of Object.entries(mapping.mapping_options)) {
            if (value === undefined) continue;

            if (!configStats[key]) {
                configStats[key] = { count: 0, values: new Set() };
            }

            configStats[key].count++;

            // Store sample values (limit to 5)
            if (configStats[key].values.size < 5) {
                if (typeof value === 'object') {
                    configStats[key].values.add(JSON.stringify(value));
                } else {
                    configStats[key].values.add(value);
                }
            }
        }
    }

    // Convert to final format
    const result: Record<string, any> = {};
    const total = mappings.length;

    for (const [key, stats] of Object.entries(configStats)) {
        const entry: any = {
            count: stats.count,
            percentage: ((stats.count / total) * 100).toFixed(1) + '%',
            sample_values: Array.from(stats.values)
        };

        // Add value descriptions for feature_group
        if (key === 'feature_group') {
            const valueDescMap: Record<string, string> = {};
            for (const value of stats.values) {
                const numValue = Number(value);
                if (!isNaN(numValue) && FEATURE_GROUP_DESCRIPTIONS[numValue]) {
                    valueDescMap[String(numValue)] = FEATURE_GROUP_DESCRIPTIONS[numValue];
                }
            }
            if (Object.keys(valueDescMap).length > 0) {
                entry.value_descriptions = valueDescMap;
            }
        }

        result[key] = entry;
    }

    return result;
}

function generateSummary(mappings: MappingEntry[], testMap?: Map<string, string>, settingsUsages?: SettingUsage[]): Summary {
    const summary: Summary = {
        total: mappings.length,
        by_mode: {},
        by_type: {},
        by_handler_type: {},
        migrated: 0,
        not_migrated: 0,
        validation: {
            valid: 0,
            invalid: 0,
            not_migrated: 0
        },
        config_options: generateConfigOptionsReport(mappings),  // NEW: Add config options discovery
        tests: (testMap && settingsUsages) ? generateTestCoverageStats(mappings, testMap, settingsUsages) : undefined
    };

    // Track unique_ids to detect duplicates
    const uniqueIdMap = new Map<string, MappingEntry[]>();

    for (const mapping of mappings) {
        // Count by mode
        summary.by_mode[mapping.mode] = (summary.by_mode[mapping.mode] || 0) + 1;

        // Count by type
        summary.by_type[mapping.mappingType] = (summary.by_type[mapping.mappingType] || 0) + 1;

        // Count migration status (legacy)
        if (typeof mapping.annotation === 'object' && mapping.annotation.unique_id) {
            summary.migrated++;
        } else {
            summary.not_migrated++;
        }

        // Validate annotation and update counts
        const validation = validateAnnotation(mapping.annotation);
        mapping.validationStatus = validation.status;
        if (validation.errors.length > 0) {
            mapping.validationErrors = validation.errors;
        }

        // Track unique_ids for duplicate detection
        if (typeof mapping.annotation === 'object' && mapping.annotation.unique_id) {
            const uid = mapping.annotation.unique_id;
            if (!uniqueIdMap.has(uid)) {
                uniqueIdMap.set(uid, []);
            }
            uniqueIdMap.get(uid)!.push(mapping);
        }

        summary.validation[validation.status]++;
    }

    // Second pass: mark duplicates as invalid
    for (const [uid, mappingsWithId] of uniqueIdMap.entries()) {
        if (mappingsWithId.length > 1) {
            // Check if these are browser-specific variants (same key, same file, different implementations)
            const isBrowserVariant =
                mappingsWithId.every(m => m.key === mappingsWithId[0].key) && // Same key
                mappingsWithId.every(m => m.source.file === mappingsWithId[0].source.file) && // Same file
                mappingsWithId.length === 2; // Exactly 2 variants

            if (isBrowserVariant) {
                // Skip marking as invalid - these are intentional browser-specific implementations
                continue;
            }

            // Mark all but the first as invalid duplicates
            for (let i = 1; i < mappingsWithId.length; i++) {
                const mapping = mappingsWithId[i];
                // Decrement the old validation count
                if (mapping.validationStatus) {
                    summary.validation[mapping.validationStatus]--;
                }
                // Update to invalid
                mapping.validationStatus = 'invalid';
                if (!mapping.validationErrors) {
                    mapping.validationErrors = [];
                }
                mapping.validationErrors.push(
                    `Duplicate unique_id: "${uid}" (also used in ${mappingsWithId[0].source.file}:${mappingsWithId[0].source.line})`
                );
                // Increment invalid count
                summary.validation.invalid++;
            }
        }
    }

    // Compute by_handler_type across all entries
    for (const mapping of mappings) {
        if (mapping.handler_type) {
            summary.by_handler_type[mapping.handler_type] =
                (summary.by_handler_type[mapping.handler_type] || 0) + 1;
        }
    }

    return summary;
}

// ============================================================================
// SETTINGS ANNOTATIONS LOADER
// ============================================================================

/**
 * Load all settings annotations from docs/settings/all.json
 */
function loadSettingsAnnotations(): Map<string, SettingsAnnotation> {
    const annotationsPath = path.join(__dirname, '..', 'docs', 'settings', 'all.json');

    try {
        const content = fs.readFileSync(annotationsPath, 'utf-8');
        const data = JSON.parse(content);

        const annotationsMap = new Map<string, SettingsAnnotation>();

        if (data.settings && Array.isArray(data.settings)) {
            for (const setting of data.settings) {
                // Map by both unique_id and setting name
                if (setting.unique_id) {
                    annotationsMap.set(setting.unique_id, setting);
                }
            }
        }

        return annotationsMap;
    } catch (e) {
        // If annotations file doesn't exist, return empty map
        return new Map();
    }
}

// ============================================================================
// CUSTOM CONFIGURATION PARSER
// ============================================================================

/**
 * Parse custom configuration file using AST
 * Extracts mapkey/vmapkey/imapkey/cmapkey/map/unmap calls
 * Returns custom mappings with optional unique_id and description
 */
function parseCustomConfigAST(configPath: string): CustomConfiguration {
    const mappings: CustomConfigMapping[] = [];

    if (!fs.existsSync(configPath)) {
        return {
            summary: { total: 0 },
            mappings: []
        };
    }

    const code = fs.readFileSync(configPath, 'utf-8');

    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['jsx']
        });
    } catch (e) {
        // Return empty config if file can't be parsed
        return {
            summary: { total: 0 },
            mappings: []
        };
    }

    traverse(ast, {
        CallExpression(path: any) {
            const callee = path.node.callee;

            // Determine function name
            let functionName: string | undefined;

            if (t.isIdentifier(callee)) {
                // Direct call: mapkey(...), unmap(...), etc.
                functionName = callee.name;
            } else if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
                // Member call: api.mapkey(...) or self.mapkey(...)
                functionName = callee.property.name;
            }

            // Check if it's a mapping function we care about
            const supportedFunctions = ['mapkey', 'vmapkey', 'imapkey', 'cmapkey', 'mapcmdkey', 'vmapcmdkey', 'imapcmdkey', 'cmapcmdkey', 'map', 'unmap'];
            if (!functionName || !supportedFunctions.includes(functionName)) {
                return;
            }

            const args = path.node.arguments;

            // All functions need at least a key argument
            if (args.length < 1) return;

            // Extract key (first argument)
            const key = extractValue(args[0]);
            if (typeof key !== 'string') return;

            let unique_id: string | undefined;
            let description: string | undefined;

            // For mapcmdkey/vmapcmdkey/imapcmdkey/cmapcmdkey: second arg is the unique_id directly
            if (['mapcmdkey', 'vmapcmdkey', 'imapcmdkey', 'cmapcmdkey'].includes(functionName)) {
                if (args.length >= 2) {
                    const secondArg = extractValue(args[1]);
                    if (typeof secondArg === 'string') {
                        unique_id = secondArg;
                    }
                }
            }
            // For mapkey/vmapkey/imapkey/cmapkey: annotation is 2nd argument
            // For map/unmap: description might be in a different position or options object
            else if (['mapkey', 'vmapkey', 'imapkey', 'cmapkey'].includes(functionName)) {
                if (args.length >= 2) {
                    const annotation = extractValue(args[1]);

                    // If annotation is an object, extract unique_id and short/description
                    if (typeof annotation === 'object' && annotation !== null) {
                        unique_id = annotation.unique_id;
                        description = annotation.short || annotation.description;
                    } else if (typeof annotation === 'string') {
                        // For legacy string annotations, use as description
                        description = annotation;
                    }
                }
            }

            mappings.push({
                key,
                type: functionName as any,
                ...(unique_id && { unique_id }),
                ...(description && { description })
            });
        }
    });

    return {
        summary: { total: mappings.length },
        mappings
    };
}

function generateIssues(mappings: MappingEntry[], invalidTestFiles?: string[]): Issues {
    const annotationsInvalid: Array<{ key: string; unique_id?: string; file: string; line: number; errors: string[] }> = [];
    const annotationsNotMigrated: Array<{ key: string; file: string; line: number }> = [];
    const testsMissing: string[] = [];
    const customMappingsUnmapped: string[] = [];
    const codeCoverageMissing: string[] = [];

    for (const mapping of mappings) {
        if (mapping.validationStatus === 'invalid') {
            annotationsInvalid.push({
                key: mapping.key,
                ...(typeof mapping.annotation === 'object' && mapping.annotation.unique_id
                    ? { unique_id: mapping.annotation.unique_id }
                    : {}),
                file: mapping.source.file,
                line: mapping.source.line,
                errors: mapping.validationErrors ?? []
            });
        } else if (mapping.validationStatus === 'not_migrated') {
            annotationsNotMigrated.push({
                key: mapping.key,
                file: mapping.source.file,
                line: mapping.source.line
            });
        }

        const uid = typeof mapping.annotation === 'object' ? mapping.annotation.unique_id : undefined;

        if (uid) {
            if (mapping.test_coverage && !mapping.test_coverage.hasTest) {
                testsMissing.push(uid);
            }
            if (mapping.custom_mapping && !mapping.custom_mapping.hasMapping) {
                customMappingsUnmapped.push(uid);
            }
            if (mapping.code_coverage && !mapping.code_coverage.hasData) {
                codeCoverageMissing.push(uid);
            }
        }
    }

    return {
        annotations: {
            invalid: annotationsInvalid,
            not_migrated: annotationsNotMigrated
        },
        tests: {
            missing: testsMissing.sort(),
            invalid_files: (invalidTestFiles ?? []).slice().sort()
        },
        custom_mappings: {
            unmapped: customMappingsUnmapped.sort()
        },
        code_coverage: {
            missing: codeCoverageMissing.sort()
        }
    };
}

// ============================================================================
// MAIN
// ============================================================================

function buildReport(): Report {
    const srcDir = path.join(__dirname, '..', 'src');
    const mappings: MappingEntry[] = [];

    // Load settings annotations
    const annotationsMap = loadSettingsAnnotations();

    // Scan all source files
    scanDirectory(srcDir, srcDir, mappings);

    // Scan for settings usage
    const settingsUsages: SettingUsage[] = [];
    scanDirectoryForSettings(srcDir, srcDir, settingsUsages);
    const settingsStats = generateSettingsStatistics(settingsUsages, annotationsMap);

    // Sort by mode, then by key
    mappings.sort((a, b) => {
        if (a.mode !== b.mode) return a.mode.localeCompare(b.mode);
        return a.key.localeCompare(b.key);
    });

    // Scan for test files
    const projectRoot = path.join(__dirname, '..');
    const testMap = scanTestFiles(projectRoot);

    // Generate summary
    const summary = generateSummary(mappings, testMap, settingsUsages);

    // Parse custom configuration
    const customConfigPath = path.join(process.env.HOME || '/root', '.surfingkeys-2026.js');
    const customConfig = parseCustomConfigAST(customConfigPath);

    // Add custom_mapping field to each mapping and get coverage counts
    const customMappingCoverage = generateCustomMappingStats(mappings, customConfig);
    summary.custom_mapping_coverage = customMappingCoverage;

    // Add code_coverage field to each mapping
    const coverageRawDir = path.join(projectRoot, 'coverage-raw');
    const coverageSummary = generateCoverageStats(mappings, coverageRawDir);
    summary.code_coverage = coverageSummary;

    // Generate actionable issues (must run after all per-mapping fields are populated)
    const issues = generateIssues(mappings, summary.tests?.invalid_test_names);

    return {
        mappings: {
            summary,
            list: mappings
        },
        settings: settingsStats,
        issues,
        ...(customConfig.mappings.length > 0 && { custom_configuration: customConfig })
    };
}

async function runIntegrityCheck(): Promise<void> {
    const report = buildReport();

    const Ajv = (await import('ajv/dist/2020')).default;
    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile(REPORT_JSON_SCHEMA);
    const valid = validate(report);

    const result = {
        integrity: valid ? 'ok' : 'fail',
        errors: validate.errors?.map(e => `${e.instancePath} ${e.message}`) ?? []
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(valid ? 0 : 1);
}

function main(): void {
    if (process.argv.includes('--schema')) {
        process.stdout.write(JSON.stringify(REPORT_JSON_SCHEMA, null, 2) + '\n');
        return;
    }

    if (process.argv.includes('--integrity')) {
        runIntegrityCheck();
        return;
    }

    const report = buildReport();
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main();
