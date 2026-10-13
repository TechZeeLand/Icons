(function () {
    'use strict';
    var STORAGE_KEY = 'zi-theme';
    var root = document.documentElement;
    var toggle = document.getElementById('theme-toggle');
    var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function currentTheme() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }

    function applyTheme(theme, persist) {
        root.setAttribute('data-theme', theme);
        if (toggle) {
            var isDark = theme === 'dark';
            toggle.setAttribute('aria-pressed', String(isDark));
            toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
        }
        if (persist) { try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* private mode */ } }
    }

    applyTheme(currentTheme(), false);
    if (toggle) toggle.addEventListener('click', function () { applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true); });

    // Keep following the OS setting until the visitor makes an explicit choice.
    if (mql) {
        mql.addEventListener('change', function (e) {
            var explicit = false;
            try { explicit = !!localStorage.getItem(STORAGE_KEY); } catch (err) { /* ignore */ }
            if (!explicit) applyTheme(e.matches ? 'dark' : 'light', false);
        });
    }
})();
