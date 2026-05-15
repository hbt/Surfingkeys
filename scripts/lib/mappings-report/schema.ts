// ============================================================================
// JSON SCHEMA
// ============================================================================

export const REPORT_JSON_SCHEMA = {
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
                "summary": { "$ref": "#/$defs/Summary", "description": "Aggregate statistics for all mappings" },
                "list": {
                    "type": "array",
                    "description": "Flat list of all mapping entries extracted from source files",
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
                    "description": "Aggregate statistics for all settings usages found across source files",
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
                                "content": { "$ref": "#/$defs/TargetCoverage", "description": "Coverage stats for the content script target" },
                                "background": { "$ref": "#/$defs/TargetCoverage", "description": "Coverage stats for the service worker (background) target" }
                            }
                        }
                    }
                },
                "relevant_coverage": {
                    "$ref": "#/$defs/RelevantCoverage",
                    "description": "Baseline-diffed coverage showing which functions are uniquely exercised by this command; present only when code coverage data exists"
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
                    "description": "Aggregate statistics for the custom config file",
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
        "RelevantFunction": {
            "type": "object",
            "description": "A single function that fired uniquely during this command's execution (after baseline subtraction)",
            "required": ["functionName", "sourceFile", "deltaCount"],
            "properties": {
                "functionName": { "type": "string", "description": "V8 function name as reported in coverage data" },
                "sourceFile": { "type": ["string", "null"], "description": "Original source file resolved via source map (e.g. src/content_scripts/common/scroll.ts), or null if unresolvable" },
                "deltaCount": { "type": "integer", "description": "Execution count minus baseline count; always >= 1 for included functions" }
            }
        },
        "RelevantCoverageSourceFileEntry": {
            "type": "object",
            "description": "Functions grouped under a single source file in relevant coverage",
            "required": ["functions", "count"],
            "properties": {
                "functions": {
                    "type": "array",
                    "description": "Functions from this source file that are relevant to this command",
                    "items": { "$ref": "#/$defs/RelevantFunction" }
                },
                "count": { "type": "integer", "description": "Number of relevant functions in this source file" }
            }
        },
        "RelevantCoverageTarget": {
            "type": "object",
            "description": "Baseline-diffed coverage for one target (content or background), grouped by source file",
            "required": ["totalFunctions", "bySourceFile"],
            "properties": {
                "totalFunctions": { "type": "integer", "description": "Total relevant functions after baseline subtraction" },
                "bySourceFile": {
                    "type": "object",
                    "description": "Functions grouped by original source file path; key is the src/-relative path or __unresolved__ for unmapped functions",
                    "additionalProperties": { "$ref": "#/$defs/RelevantCoverageSourceFileEntry" }
                }
            }
        },
        "RelevantCoverage": {
            "type": "object",
            "description": "Baseline-diffed relevant coverage for a single command, showing which functions are uniquely exercised beyond the idle baseline",
            "required": ["commandId", "hasBaseline", "baselineSource", "content", "background"],
            "properties": {
                "commandId": { "type": "string", "description": "The unique_id of the command, e.g. cmd_scroll_down" },
                "hasBaseline": { "type": "boolean", "description": "Whether any baseline was available for diffing" },
                "baselineSource": {
                    "type": "string",
                    "description": "How the baseline was obtained: probe (from probe/background/ files), derived (computed from cross-command content coverage), or none (no baseline available)",
                    "enum": ["probe", "derived", "none"]
                },
                "content": {
                    "description": "Relevant coverage for the content script target; null if no content coverage data exists",
                    "oneOf": [
                        { "$ref": "#/$defs/RelevantCoverageTarget" },
                        { "type": "null" }
                    ]
                },
                "background": {
                    "description": "Relevant coverage for the service worker target after baseline subtraction; null if no background coverage data exists",
                    "oneOf": [
                        { "$ref": "#/$defs/RelevantCoverageTarget" },
                        { "type": "null" }
                    ]
                }
            }
        },
        "CategoryStats": {
            "type": "object",
            "description": "Test/coverage statistics for a single command category",
            "required": ["total", "has_test", "missing", "coverage_pct", "missing_ids"],
            "properties": {
                "total":        { "type": "integer", "description": "Total migrated mappings in this category" },
                "has_test":     { "type": "integer", "description": "Mappings with at least one Playwright test" },
                "missing":      { "type": "integer", "description": "Mappings with no test (length of missing_ids)" },
                "coverage_pct": { "type": "number",  "description": "has_test / total × 100, rounded to 1 decimal" },
                "missing_ids":  { "type": "array", "items": { "type": "string" }, "description": "Sorted unique_ids with no test" }
            }
        },
        "Issues": {
            "type": "object",
            "description": "Actionable problem lists — items that need attention, surfaced from all checks. Design principle: list=full data, summary=aggregate counts, issues=actionable problem lists",
            "required": ["annotations", "tests", "custom_mappings", "code_coverage", "source_validation", "config_validation"],
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
                    "required": ["missing", "invalid_files", "by_category"],
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
                        },
                        "by_category": {
                            "type": "object",
                            "description": "Test coverage breakdown grouped by command category (second segment of unique_id, e.g. 'visual' from 'cmd_visual_foo'). Sorted alphabetically by category key.",
                            "additionalProperties": { "$ref": "#/$defs/CategoryStats" }
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
                    "required": ["missing", "by_category"],
                    "properties": {
                        "missing": {
                            "type": "array",
                            "description": "unique_ids of migrated mappings with no V8 coverage data (hasData=false)",
                            "items": { "type": "string" }
                        },
                        "by_category": {
                            "type": "object",
                            "description": "V8 code coverage breakdown grouped by command category (second segment of unique_id). Sorted alphabetically by category key.",
                            "additionalProperties": { "$ref": "#/$defs/CategoryStats" }
                        }
                    }
                },
                "source_validation": {
                    "type": "object",
                    "description": "Source-level key binding validation issues",
                    "required": ["prefix_conflicts", "g_placeholder_issues"],
                    "properties": {
                        "prefix_conflicts": {
                            "type": "array",
                            "description": "Pairs of default mappings where one key is a strict prefix of another in the same mode",
                            "items": {
                                "type": "object",
                                "required": ["mode", "blocked_key", "blocked_id", "blocked_short", "blocker_key", "blocker_id", "blocker_short"],
                                "properties": {
                                    "mode": { "type": "string", "description": "Input mode in which the conflict occurs" },
                                    "blocked_key": { "type": "string", "description": "Key that is blocked (longer key sequence)" },
                                    "blocked_id": { "type": ["string", "null"], "description": "unique_id of the blocked mapping, or null if not migrated" },
                                    "blocked_short": { "type": "string", "description": "Short label of the blocked mapping" },
                                    "blocker_key": { "type": "string", "description": "Key that blocks (shorter key sequence, strict prefix)" },
                                    "blocker_id": { "type": ["string", "null"], "description": "unique_id of the blocker mapping, or null if not migrated" },
                                    "blocker_short": { "type": "string", "description": "Short label of the blocker mapping" }
                                }
                            }
                        },
                        "g_placeholder_issues": {
                            "type": "array",
                            "description": "Problems with g-XXX placeholder key numbering (duplicates, gaps, wrong start)",
                            "items": {
                                "type": "object",
                                "required": ["type", "key", "message"],
                                "properties": {
                                    "type": { "type": "string", "enum": ["duplicate", "gap", "wrong_start"], "description": "Category of g-XXX issue" },
                                    "key": { "type": "string", "description": "The g-XXX key involved in the issue" },
                                    "message": { "type": "string", "description": "Human-readable description of the issue" },
                                    "affected_ids": { "type": "array", "items": { "type": "string" }, "description": "unique_ids sharing the duplicate key; present for duplicate type only" }
                                }
                            }
                        }
                    }
                },
                "config_validation": {
                    "type": "object",
                    "description": "User config file validation issues",
                    "required": ["prefix_conflicts", "invalid_mapcmdkey_targets"],
                    "properties": {
                        "prefix_conflicts": {
                            "type": "array",
                            "description": "Pairs of user config mappings where one key is a strict prefix of another",
                            "items": {
                                "type": "object",
                                "required": ["blocked_key", "blocker_key", "blocker_target"],
                                "properties": {
                                    "blocked_key": { "type": "string", "description": "Key that is blocked (longer sequence)" },
                                    "blocker_key": { "type": "string", "description": "Key that blocks (shorter sequence, strict prefix)" },
                                    "blocker_target": { "type": "string", "description": "Target (unique_id or key) of the blocker entry" }
                                }
                            }
                        },
                        "invalid_mapcmdkey_targets": {
                            "type": "array",
                            "description": "mapcmdkey entries referencing a unique_id not found in the default mappings",
                            "items": {
                                "type": "object",
                                "required": ["key", "unique_id"],
                                "properties": {
                                    "key": { "type": "string", "description": "Key sequence used in the mapcmdkey call" },
                                    "unique_id": { "type": "string", "description": "The unrecognised unique_id that was referenced" }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
} as const;
