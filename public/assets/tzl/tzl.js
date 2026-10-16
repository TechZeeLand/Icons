/* TZL Kit: shared behaviour (theme, menus, copy buttons, confirm, admin link editors). No dependencies. */
(function () {
    'use strict';
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
    window.TZL = window.TZL || {};

    /* ---------- theme ---------- */
    var KEY = 'tzl-theme', root = document.documentElement, toggle = $('#theme-toggle');
    function theme() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
    function apply(t, persist) {
        root.setAttribute('data-theme', t);
        if (toggle) { toggle.setAttribute('aria-pressed', String(t === 'dark')); toggle.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'); }
        if (persist) { try { localStorage.setItem(KEY, t); } catch (e) {} }
        document.dispatchEvent(new CustomEvent('tzl:theme', { detail: t }));
    }
    apply(theme(), false);
    if (toggle) { toggle.addEventListener('click', function () { apply(theme() === 'dark' ? 'light' : 'dark', true); }); }
    if (window.matchMedia) {
        var mql = window.matchMedia('(prefers-color-scheme: dark)');
        if (mql.addEventListener) {
            mql.addEventListener('change', function (e) {
                var stored = null; try { stored = localStorage.getItem(KEY); } catch (err) {}
                if (!stored && (root.getAttribute('data-theme-default') || 'auto') === 'auto') { apply(e.matches ? 'dark' : 'light', false); }
            });
        }
    }

    /* ---------- clipboard + copy buttons ---------- */
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) { return navigator.clipboard.writeText(text); }
        return new Promise(function (ok, no) {
            var ta = document.createElement('textarea');
            ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy') ? ok() : no(); } catch (e) { no(e); }
            document.body.removeChild(ta);
        });
    }
    window.TZL.copy = copyText;
    $$('.code-block').forEach(function (block) {
        if ($('.copy-btn', block)) { return; }
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'copy-btn';
        b.innerHTML = '<i class="zi zi-copy" aria-hidden="true"></i><span>Copy</span>';
        b.addEventListener('click', function () {
            var c = $('code', block);
            copyText(c ? c.textContent : '').then(function () {
                var l = $('span', b), i = $('i', b);
                b.classList.add('is-done'); l.textContent = 'Copied'; i.className = 'zi zi-check';
                setTimeout(function () { b.classList.remove('is-done'); l.textContent = 'Copy'; i.className = 'zi zi-copy'; }, 1600);
            });
        });
        block.appendChild(b);
    });

    var urlBtn = $('[data-copy-url]');
    if (urlBtn) {
        urlBtn.addEventListener('click', function () {
            var orig = urlBtn.innerHTML;
            copyText(location.href.split('#')[0]).then(function () {
                urlBtn.innerHTML = '<i class="zi zi-check" aria-hidden="true"></i> Link copied';
                setTimeout(function () { urlBtn.innerHTML = orig; }, 1600);
            });
        });
    }

    /* ---------- menus ---------- */
    [['#menu-toggle', '#main-nav'], ['#admin-menu-toggle', '#admin-nav']].forEach(function (p) {
        var btn = $(p[0]), nav = $(p[1]);
        if (!btn || !nav) { return; }
        btn.addEventListener('click', function () { btn.setAttribute('aria-expanded', String(nav.classList.toggle('is-open'))); });
    });
    document.addEventListener('click', function (e) {
        $$('.svc-menu[open]').forEach(function (d) { if (!d.contains(e.target)) { d.removeAttribute('open'); } });
        var el = e.target.closest ? e.target.closest('[data-confirm]') : null;
        if (el && !window.confirm(el.getAttribute('data-confirm'))) { e.preventDefault(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { $$('.svc-menu[open]').forEach(function (d) { d.removeAttribute('open'); }); } });

    /* ---------- notice banner ---------- */
    var cb = $('#cookie-banner'), ok = $('#cookie-ok');
    if (cb && !cb.hasAttribute('data-consent-banner')) {   // consent banners are driven by the service's own script
        var seen = false; try { seen = localStorage.getItem('tzl-notice') === '1'; } catch (e) {}
        cb.hidden = seen;
        if (ok) { ok.addEventListener('click', function () { cb.hidden = true; try { localStorage.setItem('tzl-notice', '1'); } catch (e) {} }); }
    }

    /* ---------- admin: repeatable link editors ---------- */
    $$('[data-link-editor]').forEach(function (ed) {
        var rows = $('[data-rows]', ed), tpl = $('[data-template]', ed), next = $$('[data-row]', ed).length;
        ed.addEventListener('click', function (e) {
            var t = e.target.closest ? e.target.closest('button') : null;
            if (!t) { return; }
            var row = t.closest('[data-row]');
            if (t.hasAttribute('data-add')) {
                var html = tpl.innerHTML.replace(/__i__/g, String(next++));
                var d = document.createElement('div'); d.innerHTML = html;
                rows.appendChild(d.firstElementChild);
            } else if (t.hasAttribute('data-remove') && row) {
                row.parentNode.removeChild(row);
            } else if (t.hasAttribute('data-move') && row) {
                var dir = parseInt(t.getAttribute('data-move'), 10);
                if (dir < 0 && row.previousElementSibling) { rows.insertBefore(row, row.previousElementSibling); }
                if (dir > 0 && row.nextElementSibling) { rows.insertBefore(row.nextElementSibling, row); }
            }
        });
    });

    /* ---------- admin: colour picker <-> hex field ---------- */
    $$('[data-color-sync]').forEach(function (c) {
        var t = c.parentNode.querySelector('[data-color-text]');
        if (!t) { return; }
        c.addEventListener('input', function () { t.value = c.value; });
        t.addEventListener('input', function () { if (/^#[0-9a-fA-F]{6}$/.test(t.value)) { c.value = t.value; } });
    });
})();
