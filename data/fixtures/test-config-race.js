// Race-repro config: unmaps default 'j' (scroll down) so it becomes a no-op,
// and sets a marker attribute once this config has actually been applied.
document.documentElement.dataset.skRaceConfigApplied = 'true';
api.unmap('j');
