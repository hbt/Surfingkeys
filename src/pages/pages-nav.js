// Shared Navigation for extension pages
(function() {
    const pageMap = {
        'options': 'chrome-extension://{extensionId}/pages/options.html',
        'errors': 'chrome-extension://{extensionId}/pages/error-viewer.html',
        'stats': 'chrome-extension://{extensionId}/pages/stats-viewer.html'
    };

    function initializeNavigation() {
        // Get current page name from URL
        const currentPage = getCurrentPageName();

        // Update active nav item
        const navLinks = document.querySelectorAll('.pages-nav a');
        navLinks.forEach(link => {
            if (link.dataset.page === currentPage) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Add click handlers
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetPage = link.dataset.page;
                navigateToPage(targetPage);
            });
        });
    }

    function getCurrentPageName() {
        const pathname = window.location.pathname;
        if (pathname.includes('options.html')) return 'options';
        if (pathname.includes('error-viewer.html')) return 'errors';
        if (pathname.includes('stats-viewer.html')) return 'stats';
        return null;
    }

    function navigateToPage(page) {
        // Get the extension ID from current URL
        const extensionId = chrome.runtime.id;
        const pageUrl = pageMap[page].replace('{extensionId}', extensionId);
        window.location.href = pageUrl;
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeNavigation);
    } else {
        initializeNavigation();
    }
})();
