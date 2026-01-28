// Surfingkeys config fixture for cmd_scroll_down scrollStepSize test
// Forces consistent, non-animated scrolling so CDP tests can measure pixel deltas.
settings.scrollStepSize = 20;
settings.smoothScroll = false;
window.__SK_CUSTOM_SCROLL_STEP__ = settings.scrollStepSize;
