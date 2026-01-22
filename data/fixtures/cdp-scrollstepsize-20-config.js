// Headless config-set test fixture
// Provides scrollStepSize=20 and a test mapping to validate custom script execution
settings.scrollStepSize = 20;
settings.smoothScroll = false;

// Marker so tests can assert the script executed
window.__SK_HEADLESS_CONFIG_SET__ = 'scroll-step-20';

// Map 'w' to scroll down to prove the script ran
api.mapkey('w', '#0TEST: headless config-set scroll down', function() {
    api.Normal.scroll('down');
});
