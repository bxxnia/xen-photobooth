// admin.js - admin dashboard: layouts (step 2), templates, frames, settings.
// PRIVACY: nothing in this file reads or saves user photos. The admin only handles settings.
const view = document.getElementById("view");
const toastEl = document.getElementById("toast");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let cfg = XenConfig.load();
let tab = "layouts";
let toastTimer;

function toast(text, isError = false) {
    toastEl.textContent = text;
    toastEl.classList.toggle("error", isError);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}
function persist(text = "Saved") {
    if (XenConfig.save(cfg)) toast(`${text} ✓ Live on the photobooth.`);
    else toast("Could not save. Browser storage is full (try a smaller logo).", true);
}
const hasUsableLayout = () => cfg.layouts.some((l) => l.active) || !!XenConfig.activeTemplate(cfg);

const toggle = (kind, id, checked, disabled = false) =>
    `<label class="switch"><input type="checkbox" data-kind="${kind}" data-id="${id}" data-field="active" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}><i></i><span>${checked ? "Active" : "Hidden"}</span></label>`;

function layoutsView() {
    return `<div class="section-head"><h2>Step 2 layouts</h2></div>
    <p class="hint">These are the choices users see in "Choose your shape". Edit the name or description, and switch Active/Hidden to show or hide a layout for users.</p>
    <div class="list">${cfg.layouts.map((l) => `<div class="item ${l.active ? "is-active" : ""}">
        <div class="item-main"><label>Name<input type="text" data-kind="layouts" data-id="${l.id}" data-field="name" value="${esc(l.name)}"></label>
        <label>Description<input type="text" data-kind="layouts" data-id="${l.id}" data-field="desc" value="${esc(l.desc)}"></label>
        <span class="count-note">${XenConfig.TYPE_COUNTS[l.id]} photos</span></div>
        ${toggle("layouts", l.id, l.active)}</div>`).join("")}</div>
    <p class="hint" style="margin-top:16px">The "Custom event template" card only appears when a template is in use (see the Templates tab).</p>`;
}

function framesView() {
    const patternOptions = (sel) => Object.entries(XenConfig.PATTERNS).map(([v, n]) => `<option value="${v}" ${sel === v ? "selected" : ""}>${n}</option>`).join("");
    const color = (f, field, label) => `<label>${label}<input type="color" data-kind="frames" data-id="${f.id}" data-field="${field}" value="${esc(f.bg2 && field === "bg2" ? f.bg2 : f[field])}"></label>`;
    return `<div class="section-head"><h2>Frames</h2><button class="btn primary" data-act="add-frame">+ Add frame</button></div>
    <p class="hint">Frames are full photobooth backgrounds (color or gradient with a pattern) that sit behind the photos. Users see every Active frame in the Style step. Built-in frames can be hidden or duplicated; custom frames can be edited or deleted.</p>
    <div class="list">${cfg.frames.map((f) => f.builtin
        ? `<div class="item"><div class="item-main"><span class="swatch-cell">${XenConfig.swatchHtml(f)}</span><strong>${esc(f.name)}</strong><span class="count-note">Built-in</span></div>
            <div class="item-side">${toggle("frames", f.id, f.active, f.id === "none")}${f.id === "none" ? "" : `<button class="btn ghost" data-act="dup-frame" data-id="${f.id}">Duplicate &amp; edit</button>`}</div></div>`
        : `<div class="item"><span class="swatch-cell">${XenConfig.swatchHtml(f)}</span><div class="item-main">
            <label>Name<input type="text" data-kind="frames" data-id="${f.id}" data-field="name" value="${esc(f.name)}"></label>
            <label>Pattern<select data-kind="frames" data-id="${f.id}" data-field="pattern">${patternOptions(f.pattern)}</select></label>
            ${color(f, "bg", "Background")}
            ${color(f, "bg2", "Gradient end (same = solid)")}
            ${color(f, "accent", "Pattern color")}</div>
          <div class="item-side">${toggle("frames", f.id, f.active)}<button class="btn danger" data-act="del-frame" data-id="${f.id}">Delete</button></div></div>`).join("")}</div>`;
}

function templatesView() {
    const frameOptions = (sel) => cfg.frames.map((f) => `<option value="${f.id}" ${f.id === sel ? "selected" : ""}>${esc(f.name)}</option>`).join("");
    const cards = cfg.templates.map((t) => {
        const on = t.id === cfg.activeTemplateId;
        const field = (name, label, type, extra = "") => `<label>${label}<input type="${type}" data-kind="templates" data-id="${t.id}" data-field="${name}" value="${esc(t[name])}" ${extra}></label>`;
        return `<div class="card-form ${on ? "is-active" : ""}">
        <div class="tpl-preview" style="background:${esc(t.bg)};color:${esc(t.textColor)}"><strong>${esc(t.brandText || "XEN PHOTOBOOTH")}</strong><span>${esc(t.eventName || "made with love")}</span>${t.logo ? `<img src="${t.logo}" alt="">` : ""}</div>
        ${field("name", "Template name", "text")}
        <label>Photo layout<select data-kind="templates" data-id="${t.id}" data-field="layoutType">${[["strip", "Photostrip (4)"], ["grid", "Grid (4)"], ["polaroid", "Polaroid (2)"], ["square", "Square collage (4)"]].map(([v, n]) => `<option value="${v}" ${t.layoutType === v ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <div class="row2">${field("bg", "Background (when no frame)", "color")}${field("textColor", "Text color", "color")}</div>
        ${field("brandText", "Footer title", "text", 'placeholder="XEN PHOTOBOOTH"')}
        ${field("eventName", "Default event name", "text")}
        <label>Default frame<select data-kind="templates" data-id="${t.id}" data-field="frameId">${frameOptions(t.frameId)}</select></label>
        <div class="logo-row"><label style="min-width:0">Logo<input type="file" accept="image/*" data-kind="logo" data-id="${t.id}"></label>${t.logo ? `<button class="btn ghost" data-act="rm-logo" data-id="${t.id}">Remove logo</button>` : ""}</div>
        <div class="card-actions">${on ? `<span class="badge">In use by users</span><button class="btn soft" data-act="clear-template">Stop using</button>` : `<button class="btn primary" data-act="use-template" data-id="${t.id}">Use this template</button>`}
        <button class="btn ghost" data-act="dup-template" data-id="${t.id}">Duplicate</button><button class="btn danger" data-act="del-template" data-id="${t.id}">Delete</button></div></div>`;
    }).join("");
    return `<div class="section-head"><h2>Templates</h2><button class="btn primary" data-act="add-template">+ New template</button></div>
    <p class="hint">Create as many templates as you like. Click "Use this template" to show it to users as the "Custom event template" (only one can be in use at a time).</p>
    ${cards ? `<div class="card-grid">${cards}</div>` : `<div class="empty">No templates yet. Click "+ New template" to get started.</div>`}`;
}

function settingsView() {
    return `<div class="section-head"><h2>Settings</h2></div>
    <div class="privacy-note"><strong>Privacy:</strong> The admin never saves or sees users' photos. Photos stay in the user's browser while they use the booth and are gone when a new session starts. This page only holds layouts, templates, and frames.</div>
    <div class="settings-grid">
      <div class="card-form"><h3>Admin login</h3><p class="hint" style="margin:0">Admin credentials are managed in the server environment using ADMIN_USERNAME and ADMIN_PASSWORD. Update them in your hosting provider's environment settings, then restart or redeploy the app.</p></div>
      <div class="card-form"><h3>Backup &amp; transfer</h3><p class="hint" style="margin:0">Settings are saved in this browser. To move them to another device, export here and import there.</p>
        <div class="card-actions"><button class="btn soft" data-act="export">Export settings</button><label class="btn ghost" style="cursor:pointer">Import settings<input type="file" accept="application/json" id="importFile" hidden></label><button class="btn danger" data-act="reset">Reset to defaults</button></div></div>
    </div>`;
}

function render() {
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    view.innerHTML = { layouts: layoutsView, templates: templatesView, frames: framesView, settings: settingsView }[tab]();
}

function shrinkImage(file, max = 320) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, max / Math.max(img.width, img.height));
            const c = document.createElement("canvas");
            c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            resolve(c.toDataURL("image/png"));
        };
        img.onerror = reject;
        img.src = url;
    });
}

const listFor = (kind) => ({ layouts: cfg.layouts, frames: cfg.frames, templates: cfg.templates }[kind]);

document.addEventListener("change", async (event) => {
    const el = event.target;
    if (el.id === "importFile") return importSettings(el.files[0]);
    const { kind, id, field } = el.dataset;
    if (!kind) return;
    const item = listFor(kind === "logo" ? "templates" : kind)?.find((x) => x.id === id);
    if (!item) return;
    if (kind === "logo") {
        if (!el.files[0]) return;
        try { item.logo = await shrinkImage(el.files[0]); persist("Logo added"); render(); } catch { toast("Could not read that image.", true); }
        return;
    }
    const value = el.type === "checkbox" ? el.checked : el.value;
    const previous = item[field];
    item[field] = value;
    if (field === "active" && !hasUsableLayout()) { item.active = previous; toast("At least one layout or template must stay Active.", true); render(); return; }
    persist();
    render();
});

document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-act]");
    if (!btn) return;
    const { act, id } = btn.dataset;
    const tpl = cfg.templates.find((t) => t.id === id);
    if (act === "tab") { tab = btn.dataset.tab; return render(); }
    if (act === "logout") {
        sessionStorage.removeItem("xenAdmin");
        fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" })
            .catch((error) => console.error("Admin logout request failed", error))
            .finally(() => { location.href = "admin-login.html"; });
        return;
    }
    if (act === "add-frame") cfg.frames.push({ id: XenConfig.uid("frame"), name: "New frame", builtin: false, active: true, bg: "#fbdde5", bg2: "#fbdde5", pattern: "hearts", accent: "#e58fa8" });
    else if (act === "dup-frame") {
        const src = cfg.frames.find((f) => f.id === id);
        if (src) cfg.frames.push({ ...src, id: XenConfig.uid("frame"), name: `${src.name} copy`, builtin: false, active: true });
    }
    else if (act === "del-frame") {
        if (!confirm("Delete this frame?")) return;
        cfg.frames = cfg.frames.filter((f) => f.id !== id);
        cfg.templates.forEach((t) => { if (t.frameId === id) t.frameId = "none"; });
    }
    else if (act === "add-template") cfg.templates.push({ id: XenConfig.uid("tpl"), name: `Template ${cfg.templates.length + 1}`, layoutType: "strip", bg: "#fffaf7", textColor: "#59645e", brandText: "", eventName: "", frameId: "none", logo: null });
    else if (act === "dup-template" && tpl) cfg.templates.push({ ...tpl, id: XenConfig.uid("tpl"), name: `${tpl.name} copy` });
    else if (act === "del-template") {
        if (!confirm("Delete this template?")) return;
        cfg.templates = cfg.templates.filter((t) => t.id !== id);
        if (cfg.activeTemplateId === id) cfg.activeTemplateId = null;
        if (!hasUsableLayout()) { cfg.layouts[0].active = true; }
    }
    else if (act === "use-template") cfg.activeTemplateId = id;
    else if (act === "clear-template") { cfg.activeTemplateId = null; if (!hasUsableLayout()) { cfg.layouts[0].active = true; toast("First layout re-enabled so users still have something to pick."); } }
    else if (act === "rm-logo" && tpl) tpl.logo = null;
    else if (act === "export") return exportSettings();
    else if (act === "reset") { if (!confirm("Reset all layouts, templates, and frames to default?")) return; cfg = XenConfig.defaults(); }
    else return;
    persist();
    render();
});

function exportSettings() {
    const link = document.createElement("a");
    link.download = "xen-photobooth-settings.json";
    link.href = URL.createObjectURL(new Blob([JSON.stringify(cfg)], { type: "application/json" }));
    link.click();
}
async function importSettings(file) {
    if (!file) return;
    try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.layouts) || !Array.isArray(data.frames) || !Array.isArray(data.templates)) throw new Error();
        localStorage.setItem(XenConfig.KEY, JSON.stringify(data));
        cfg = XenConfig.load();
        if (!hasUsableLayout()) cfg.layouts[0].active = true;
        persist("Imported");
        render();
    } catch { toast("That is not a valid settings file.", true); }
}

render();