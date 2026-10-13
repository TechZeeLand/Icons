(function () {
    'use strict';
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

    // Confirmation prompts without inline handlers (the page CSP forbids them).
    $$('form[data-confirm]').forEach(function (f) {
        f.addEventListener('submit', function (e) { if (!window.confirm(f.getAttribute('data-confirm'))) e.preventDefault(); });
    });

    var cfg = window.__ADMIN__;
    var drop = $('#drop');
    if (!cfg || !drop) return;

    var files = $('#files'), items = [], review = $('#review'), list = $('#items'), result = $('#result');
    var setSel = $('#set');

    function kebab(name) {
        return name.replace(/\.svg$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    }
    function api(path, body) {
        return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': cfg.csrf }, body: JSON.stringify(body), credentials: 'same-origin' })
            .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); });
    }

    drop.addEventListener('click', function () { files.click(); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); files.click(); } });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });
    files.addEventListener('change', function () { addFiles(files.files); files.value = ''; });

    function addFiles(fl) {
        Array.prototype.slice.call(fl).forEach(function (f) {
            if (!/\.svg$/i.test(f.name) && f.type !== 'image/svg+xml') return;
            if (f.size > 65536) { items.push({ name: kebab(f.name), svg: '', error: 'File is larger than 64 KB.' }); return; }
            var r = new FileReader();
            r.onload = function () { items.push({ name: kebab(f.name), svg: String(r.result) }); check(); };
            r.readAsText(f);
        });
    }

    $('#padd').addEventListener('click', function () {
        var name = kebab($('#pname').value || ''), svg = $('#pcode').value.trim();
        if (!name || !svg) { alert('Enter a name and paste the SVG code.'); return; }
        items.push({ name: name, svg: svg }); $('#pname').value = ''; $('#pcode').value = ''; check();
    });

    var timer;
    function check() { clearTimeout(timer); timer = setTimeout(run, 60); }

    function run() {
        review.hidden = !items.length; result.textContent = '';
        if (!items.length) return;
        var pending = items.filter(function (i) { return !i.error; });
        api('/admin/api/icons/check', { set: setSel.value, items: pending.map(function (i) { return { name: i.name, svg: i.svg }; }) })
            .then(function (res) {
                var k = 0;
                items.forEach(function (i) { if (!i.error) { var r = res.items[k++]; i.svgOut = r.svg; i.warnings = r.warnings; i.errors = r.errors; i.exists = r.exists; i.nameError = r.nameError; } });
                render();
            })
            .catch(function (e) { result.className = 'flash error'; result.textContent = e.message; });
    }

    function render() {
        list.replaceChildren();
        items.forEach(function (it, idx) {
            var errs = (it.error ? [it.error] : (it.errors || [])).concat(it.nameError ? [it.nameError] : []);
            var card = document.createElement('div');
            card.className = 'item' + (errs.length ? ' bad' : '');
            var prev = document.createElement('div'); prev.className = 'item-prev';
            if (it.svgOut && !errs.length) { prev.innerHTML = it.svgOut; }
            var body = document.createElement('div'); body.className = 'item-body';
            var nm = document.createElement('input'); nm.type = 'text'; nm.value = it.name; nm.setAttribute('aria-label', 'Icon name'); nm.pattern = '[a-z0-9-]+';
            nm.addEventListener('change', function () { it.name = kebab(nm.value); check(); });
            body.appendChild(nm);
            if (it.exists) { var ex = document.createElement('p'); ex.className = 'hint'; ex.textContent = 'An icon with this name already exists' + ($('#overwrite').checked ? ' and will be replaced.' : '. Tick "Replace" above, or rename.'); body.appendChild(ex); }
            errs.forEach(function (m) { var p = document.createElement('p'); p.className = 'msg err'; p.textContent = m; body.appendChild(p); });
            (it.warnings || []).forEach(function (m) { var p = document.createElement('p'); p.className = 'msg warn'; p.textContent = m; body.appendChild(p); });
            var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'btn sm'; rm.textContent = 'Remove';
            rm.addEventListener('click', function () { items.splice(idx, 1); items.length ? check() : (review.hidden = true); });
            card.append(prev, body, rm); list.appendChild(card);
        });
        var ok = items.filter(function (i) { return i.svgOut && !i.error && !(i.errors || []).length && !i.nameError && (!i.exists || $('#overwrite').checked); });
        $('#count').textContent = ok.length; $('#save').disabled = !ok.length;
    }

    $('#overwrite').addEventListener('change', render);
    setSel.addEventListener('change', function () { if (items.length) check(); });
    $('#clear').addEventListener('click', function () { items = []; review.hidden = true; });

    $('#save').addEventListener('click', function () {
        var ok = items.filter(function (i) { return i.svgOut && !i.error && !(i.errors || []).length && !i.nameError && (!i.exists || $('#overwrite').checked); });
        $('#save').disabled = true;
        api('/admin/api/icons', { set: setSel.value, overwrite: $('#overwrite').checked, items: ok.map(function (i) { return { name: i.name, svg: i.svg }; }) })
            .then(function (res) {
                result.className = 'flash ok';
                result.innerHTML = '';
                result.appendChild(document.createTextNode('Saved ' + res.saved.length + ' icon(s). '));
                var a = document.createElement('a'); a.href = '/admin/icons?source=custom'; a.textContent = 'View them'; result.appendChild(a);
                if (res.failed.length) result.appendChild(document.createTextNode(' · Failed: ' + res.failed.map(function (f) { return f.name + ' (' + f.error + ')'; }).join(', ')));
                var saved = {}; res.saved.forEach(function (n) { saved[n] = 1; });
                items = items.filter(function (i) { return !saved[i.name]; });
                if (items.length) check(); else { list.replaceChildren(); $('#count').textContent = 0; }
            })
            .catch(function (e) { result.className = 'flash error'; result.textContent = e.message; $('#save').disabled = false; });
    });
})();
