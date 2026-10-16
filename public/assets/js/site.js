(function () {
    'use strict';
    var cfg = {};
    try { cfg = JSON.parse(document.getElementById('zi-config').textContent) || {}; } catch (e) { cfg = {}; }
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

    /* ---- Copy buttons ---- */
    function copyText(text, btn) {
        var done = function () { var o = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = o; }, 1200); };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
        else fallback();
        function fallback() {
            var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
            document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ } t.remove();
        }
    }
    document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('.ic-code .copy');
        if (b) { copyText(b.parentNode.querySelector('code').textContent, b); return; }
        var chip = e.target.closest && e.target.closest('.name-chip');
        if (chip) {
            var code = chip.querySelector('code'), old = code.textContent;
            var done = function () { code.textContent = 'copied'; setTimeout(function () { code.textContent = old; }, 900); };
            var txt = chip.getAttribute('data-copy');
            if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, function () {});
            else { var t = document.createElement('textarea'); t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (er) { /* ignore */ } t.remove(); }
        }
    });

    /* ---- Docs: filter the icon name list ---- */
    (function () {
        var input = document.getElementById('name-filter');
        if (!input) return;
        var chips = $$('.name-chip'), cats = $$('[data-cat]'), count = document.getElementById('name-count'), empty = document.getElementById('name-empty');
        function apply() {
            var terms = input.value.trim().toLowerCase().replace(/^zi-/, '').split(/[\s,]+/).filter(Boolean), shown = 0;
            chips.forEach(function (c) {
                var hay = c.getAttribute('data-name') + ' ' + c.getAttribute('data-tags');
                var ok = terms.every(function (t) { return hay.indexOf(t) !== -1; });
                c.hidden = !ok; if (ok) shown++;
            });
            cats.forEach(function (s) { s.hidden = !s.querySelector('.name-chip:not([hidden])'); });
            count.textContent = terms.length ? shown + ' of ' + chips.length + ' shown' : '';
            empty.hidden = shown !== 0;
        }
        input.addEventListener('input', apply);
        // One request for the sprite; the previews then reference it inside this page.
        fetch('sprite.svg').then(function (r) { return r.text(); }).then(function (t) {
            var h = document.createElement('div'); h.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'; h.setAttribute('aria-hidden', 'true'); h.innerHTML = t; document.body.prepend(h);
        }).catch(function () { /* previews are optional */ });
    })();

    /* ---- Tabs ---- */
    $$('[data-tabs]').forEach(function (box, n) {
        var tabs = $$('.ic-tab', box), panels = $$('.ic-tab-panel', box);
        function select(i, focus) {
            tabs.forEach(function (t, j) { t.setAttribute('aria-selected', String(i === j)); t.tabIndex = i === j ? 0 : -1; if (i === j && focus) t.focus(); });
            panels.forEach(function (p, j) { p.hidden = i !== j; });
        }
        tabs.forEach(function (t, i) {
            t.addEventListener('click', function () { select(i); });
            t.addEventListener('keydown', function (e) {
                if (e.key === 'ArrowRight') { e.preventDefault(); select((i + 1) % tabs.length, true); }
                if (e.key === 'ArrowLeft') { e.preventDefault(); select((i - 1 + tabs.length) % tabs.length, true); }
            });
        });
        select(0);
    });

    /* ---- Docs table of contents highlight ---- */
    var toc = $$('.ic-docs-toc a');
    if (toc.length && 'IntersectionObserver' in window) {
        var map = {};
        toc.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) { toc.forEach(function (a) { a.classList.remove('on'); }); if (map[en.target.id]) map[en.target.id].classList.add('on'); }
            });
        }, { rootMargin: '-80px 0px -70% 0px' });
        $$('.ic-docs-body h2[id]').forEach(function (h) { io.observe(h); });
    }
    $$('.ic-docs-mobile-toc a').forEach(function (a) { a.addEventListener('click', function () { a.closest('details').open = false; }); });

    /* ---- Close the mobile nav when a link is chosen ---- */
    $$('.nav-pop a').forEach(function (a) { a.addEventListener('click', function () { a.closest('details').open = false; }); });

    /* ---- Gallery ---- */
    var gal = document.getElementById('gallery');
    if (!gal) return;
    var q = $('#q'), setSel = $('#set'), sizeIn = $('#size'), strokeIn = $('#stroke'), colorIn = $('#color'), grid = $('#grid'), meta = $('#meta');
    var root = document.documentElement, color = null, icons = [], total = 0, commit = null, catLabel = {};
    var base = cfg.base || location.origin;

    Promise.all([
        fetch('/sprite.svg').then(function (r) { return r.text(); }),
        fetch('/api/icons').then(function (r) { return r.json(); })
    ]).then(function (res) {
        var holder = document.createElement('div');
        holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
        holder.innerHTML = res[0];
        document.body.prepend(holder);
        icons = res[1].icons; total = res[1].total; commit = res[1].commit;
        res[1].categories.forEach(function (c) { catLabel[c.id] = c.label; setSel.add(new Option(c.label + ' (' + c.count + ')', c.id)); });
        var p = new URLSearchParams(location.search);
        if (p.get('q')) q.value = p.get('q');
        if (p.get('category')) setSel.value = p.get('category');
        style(); paint();
        if (location.hash.length > 1) { var m = icons.filter(function (i) { return i.set + '/' + i.name === location.hash.slice(1); })[0]; if (m) openIcon(m); }
    }).catch(function (e) { meta.textContent = 'Could not load icons: ' + e.message; });

    function paint() {
        var terms = q.value.trim().toLowerCase().split(/[\s,]+/).filter(Boolean), set = setSel.value;
        var list = icons.filter(function (i) {
            if (set && i.category !== set) return false;
            return terms.every(function (t) { return i.name.indexOf(t) !== -1 || (i.tags || []).some(function (x) { return x.indexOf(t) !== -1; }); });
        });
        meta.textContent = list.length + ' of ' + total + ' icons';
        var frag = document.createDocumentFragment();
        list.forEach(function (i) {
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'cell'; b.setAttribute('role', 'listitem');
            b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#' + i.set + '-' + i.name + '"/></svg><span></span>';
            b.lastChild.textContent = i.name;
            b.addEventListener('click', function () { openIcon(i); });
            frag.appendChild(b);
        });
        grid.replaceChildren(frag);
        if (!list.length) grid.innerHTML = '<p class="empty">No icons match. Try a shorter word.</p>';
        var u = new URL(location.href); q.value ? u.searchParams.set('q', q.value) : u.searchParams.delete('q'); set ? u.searchParams.set('category', set) : u.searchParams.delete('category');
        history.replaceState(null, '', u.pathname + u.search + u.hash);
    }

    function style() {
        root.style.setProperty('--size', sizeIn.value + 'px');
        root.style.setProperty('--sw', strokeIn.value);
        color ? root.style.setProperty('--ic', color) : root.style.removeProperty('--ic');
    }

    function qs() {
        var p = new URLSearchParams();
        if (sizeIn.value !== '28') p.set('size', sizeIn.value);
        if (strokeIn.value !== '2') p.set('stroke', strokeIn.value);
        if (color) p.set('color', color.slice(1));
        var s = p.toString(); return s ? '?' + s : '';
    }

    var dlg = $('#dlg');
    function openIcon(i) {
        $('#biguse').setAttribute('href', '#' + i.set + '-' + i.name);
        $('#dname').textContent = i.name; $('#dset').textContent = 'Category: ' + (catLabel[i.category] || i.category) + (i.tags && i.tags.length ? ' · ' + i.tags.join(', ') : '');
        var url = base + '/i/' + i.set + '/' + i.name + '.svg' + qs();
        $('#dl').href = '/i/' + i.set + '/' + i.name + '.svg'; $('#dl').setAttribute('download', i.name + '.svg');
        var size = sizeIn.value;
        var rows = [
            ['CSS class (like Font Awesome)', '<i class="zi zi-' + i.name + '"></i>'],
            ['Web component (inline, follows text colour)', '<svg-icon name="' + i.name + '"' + (i.set !== 'ui' ? ' set="' + i.set + '"' : '') + ' size="' + size + '"></svg-icon>'],
            ['Image tag', '<img src="' + url + '" width="' + size + '" height="' + size + '" alt="">'],
            ['URL', url]
        ];
        var box = $('#snips'); box.replaceChildren();
        rows.forEach(function (r) {
            var wrap = document.createElement('div');
            wrap.innerHTML = '<p class="code-label"></p><div class="snip"><code></code><button type="button" class="btn btn-secondary">Copy</button></div>';
            wrap.querySelector('.ic-code-label').textContent = r[0]; wrap.querySelector('code').textContent = r[1];
            var btn = wrap.querySelector('button'); btn.addEventListener('click', function () { copyText(r[1], btn); });
            box.appendChild(wrap);
        });
        if (history.replaceState) history.replaceState(null, '', location.pathname + location.search + '#' + i.set + '/' + i.name);
        dlg.showModal();
    }
    dlg.addEventListener('close', function () { history.replaceState(null, '', location.pathname + location.search); });
    $('#close').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

    q.addEventListener('input', paint); setSel.addEventListener('change', paint);
    sizeIn.addEventListener('input', style); strokeIn.addEventListener('input', style);
    colorIn.addEventListener('input', function (e) { color = e.target.value; style(); });
    $('#reset').addEventListener('click', function () { sizeIn.value = 28; strokeIn.value = 2; color = null; style(); });
})();
