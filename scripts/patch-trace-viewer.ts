// scripts/patch-trace-viewer.ts
import { readFileSync, writeFileSync, existsSync } from "fs";

const traceHtml = `${process.env.REPORT_DIR ?? "playwright-report"}/trace/index.html`;
if (!existsSync(traceHtml)) {
  console.log("No trace viewer found, skipping patch.");
  process.exit(0);
}

const inject = `
<script>/* trace-auto-expand */
(function() {
  var expanding = false;
  function expandAll() {
    if (expanding) return;
    expanding = true;
    // Collapsed items show codicon-chevron-right; expanded show codicon-chevron-down
    // Skip Before/After Hooks (keep collapsed)
    document.querySelectorAll('.codicon-chevron-right').forEach(function(el) {
      var item = el.closest('[role="treeitem"]');
      var text = item ? item.textContent : '';
      if (text.indexOf('Before Hooks') !== -1 || text.indexOf('After Hooks') !== -1) return;
      el.click();
    });
    expanding = false;
  }
  // Watch for DOM changes (React renders asynchronously)
  var obs = new MutationObserver(function() { expandAll(); });
  document.addEventListener('DOMContentLoaded', function() {
    obs.observe(document.body, { childList: true, subtree: true });
    expandAll();
  });
  // Retry after navigation/trace load
  window.addEventListener('hashchange', function() {
    setTimeout(expandAll, 300);
  });
  setTimeout(expandAll, 1000);
})();
</script>
</body>`;

let html = readFileSync(traceHtml, "utf-8");
if (html.includes("/* trace-auto-expand */")) {
  console.log("Trace viewer already patched.");
  process.exit(0);
}
html = html.replace("</body>", inject);
writeFileSync(traceHtml, html);
console.log("Patched trace viewer: auto-expand enabled.");
