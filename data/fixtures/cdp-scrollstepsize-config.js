// Test config - scrollStepSize customization
// Used by: tests/cdp/cdp-custom-config.test.ts
settings.scrollStepSize = 25;
settings.smoothScroll = false;

// Test mapping: 'g' key should scroll down (proves config is loaded)
// By default 'g' doesn't scroll, so if this mapping works, config was applied
api.mapkey('g', '#0TEST: Config loaded - scroll down', function() {
    api.Normal.scroll('down');
});
