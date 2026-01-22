/**
 * Test Configuration for Command Metadata Tests
 * Includes mappings for testing command metadata migration
 */

settings.newTabUrl = "https://google.com";
settings.colorfulKeystrokeHints = false;
settings.smoothScroll = false;
settings.scrollStepSize = 25;

// Default: "?" shows help menu (built-in command)

// Step 2: F1 mapped to show usage via api.Front.showUsage()
api.mapkey('<F1>', '#0Show usage from F1', function() {
    api.Front.showUsage();
});

// Step 3: F2 mapped using new api.mapcmdkey() with unique_id
// This test verifies the new command metadata API works
api.mapcmdkey('<F2>', 'cmd_show_usage');
