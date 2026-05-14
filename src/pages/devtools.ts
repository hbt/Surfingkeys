/**
 * devtools.js — DevTools background page (loaded via manifest.devtools_page)
 *
 * This page runs hidden inside DevTools. Its only job is to register the
 * visible "Surfingkeys" panel tab. All eval-relay logic lives in
 * devtools-panel.js which runs in the panel's own page context.
 */

chrome.devtools.panels.create(
  'Surfingkeys',   // tab title
  '',              // icon (none)
  'pages/devtools-panel.html',
  () => {}
);
