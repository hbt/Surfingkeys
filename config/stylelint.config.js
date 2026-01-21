module.exports = {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['dist/**', 'node_modules/**', 'src/pages/pdf_viewer.css'],
  rules: {
    // Customize as needed
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: ['supports']
      }
    ],
    // Allow snake_case selectors (existing codebase convention)
    'selector-class-pattern': null,
    'selector-id-pattern': null,
    'keyframes-name-pattern': null,
    'custom-property-pattern': null,
    // Allow vendor prefixes (needed for cross-browser compatibility)
    'property-no-vendor-prefix': null,
    'value-no-vendor-prefix': null,
    'selector-no-vendor-prefix': null,
    // Relax color function rules
    'color-function-notation': null,
    'color-function-alias-notation': null,
    // Relax alpha value notation
    'alpha-value-notation': null,
    // Disable formatting rules (can use prettier for formatting)
    'rule-empty-line-before': null,
    'at-rule-empty-line-before': null,
    'declaration-empty-line-before': null,
    'custom-property-empty-line-before': null,
    // Disable other strict rules for existing code
    'no-descending-specificity': null,
    'no-duplicate-selectors': null,
    'font-family-no-duplicate-names': null,
    'declaration-block-no-duplicate-properties': null,
    'value-keyword-case': null,
    'selector-attribute-quotes': null,
    'function-url-quotes': null,
    'property-no-deprecated': null,
    'length-zero-no-unit': null,
    'font-family-name-quotes': null,
    'declaration-property-value-no-unknown': null,
    'media-feature-range-notation': null,
    'selector-type-case': null,
    'selector-not-notation': null,
    'selector-pseudo-element-colon-notation': null,
    'color-hex-length': null,
    'declaration-block-no-redundant-longhand-properties': null,
    'shorthand-property-no-redundant-values': null,
    'selector-type-no-unknown': null,
    'declaration-block-no-shorthand-property-overrides': null
  }
};
