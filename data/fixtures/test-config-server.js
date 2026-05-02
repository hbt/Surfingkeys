// Surfingkeys test config — served by the config server during Playwright tests.
// IMPORTANT: must be neutral — do not unmap keys or change defaults.
// Sets a DOM attribute as a signal that this script was evaluated (visible across worlds).
document.documentElement.dataset.skConfigServerLoaded = 'true';
// Use <F9> — function keys are not mapped by default, so no prefix conflict.
api.mapkey('<F9>', '#custom Config-server test marker', function () {}, {
    unique_id: 'cmd_config_server_test_marker',
});
