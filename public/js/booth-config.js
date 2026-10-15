// booth-config.js - applies the admin's settings (layouts, frames, active template) to the photobooth.
// Load BEFORE photobooth.js. Only settings are read here; no photo ever leaves the user's device.
let boothConfig = XenConfig.defaults();
let activeTemplate = null;
let templateLogo = null;
let sharedConfigUpdatedAt = null;
let sharedSettingsSyncEnabled = true;

const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// A custom template borrows the geometry of its base layout.
function layoutType() { return selectedLayout === "custom" ? (activeTemplate?.layoutType || "grid") : selectedLayout; }
function currentPhotoCount() { return XenConfig.TYPE_COUNTS[layoutType()] || 4; }
function currentTemplate() { return selectedLayout === "custom" ? activeTemplate : null; }

function setFrame(id) {
    frameSelect.value = id;
    document.querySelectorAll('[data-picker="frame"] button').forEach((b) => b.classList.toggle("selected", b.dataset.value === id));
}

function applyTemplateDefaults() {
    if (selectedLayout !== "custom" || !activeTemplate) return;
    if (boothConfig.frames.some((f) => f.active && f.id === activeTemplate.frameId)) {
        setFrame(activeTemplate.frameId);
        frameSelect.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (activeTemplate.eventName && !eventName.value) eventName.value = activeTemplate.eventName;
}

function buildLayoutCards() {
    const grid = document.querySelector(".layout-grid");
    const cards = boothConfig.layouts.filter((l) => l.active).map((l) => ({ id: l.id, type: l.id, name: l.name, desc: l.desc, custom: false }));
    if (activeTemplate) cards.push({ id: "custom", type: activeTemplate.layoutType, name: activeTemplate.name, desc: "Event template", custom: true });
    if (!cards.some((c) => c.id === selectedLayout)) selectedLayout = cards[0]?.id || "strip";
    grid.innerHTML = cards.map((c) => {
        const count = XenConfig.TYPE_COUNTS[c.type] || 4;
        return `<button class="layout-card${c.id === selectedLayout ? " selected" : ""}${c.custom ? " custom-layout" : ""}" type="button" data-layout="${escHtml(c.id)}"><span class="layout-preview ${c.type}-preview">${"<i></i>".repeat(count)}</span><strong>${escHtml(c.name)}</strong><small>${escHtml(c.desc)} · ${count} photos</small></button>`;
    }).join("");
    grid.querySelectorAll("[data-layout]").forEach((card) => card.addEventListener("click", () => {
        grid.querySelectorAll("[data-layout]").forEach((item) => item.classList.remove("selected"));
        card.classList.add("selected");
        selectedLayout = card.dataset.layout;
        applyTemplateDefaults();
        applyLayoutPhotoLimit();
        renderFinalCanvas();
    }));
}

function buildFramePicker() {
    const frames = boothConfig.frames.filter((f) => f.active);
    const current = frames.some((f) => f.id === frameSelect.value) ? frameSelect.value : "none";
    frameSelect.innerHTML = frames.map((f) => `<option value="${escHtml(f.id)}">${escHtml(f.name)}</option>`).join("");
    const picker = document.querySelector('[data-picker="frame"]');
    picker.innerHTML = frames.map((f) => `<button type="button" data-value="${escHtml(f.id)}" aria-label="${escHtml(f.name)}">${XenConfig.swatchHtml(f)}</button>`).join("");
    picker.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
        setFrame(button.dataset.value);
        frameSelect.dispatchEvent(new Event("input", { bubbles: true }));
    }));
    setFrame(current);
}

// ---- Full-background frames (photobooth style) ----
// Picks the background colors and footer text color for the current frame/template.
function resolveLook() {
    const frame = boothConfig.frames.find((f) => f.id === frameSelect.value) || boothConfig.frames[0];
    const tpl = currentTemplate();
    const plain = frame.id === "none";
    const bg1 = plain ? (tpl?.bg || "#fffaf7") : frame.bg;
    const bg2 = plain ? bg1 : (frame.bg2 || frame.bg);
    const text = plain && tpl ? tpl.textColor : (XenConfig.isDark(bg1) ? "#fffaf7" : "#59645e");
    return { frame, bg1, bg2, text, tpl };
}

function drawPattern(ctx, w, h, pattern, accent) {
    ctx.save();
    ctx.fillStyle = accent;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (pattern === "dots") {
        ctx.globalAlpha = 0.6;
        for (let y = 24, row = 0; y < h + 44; y += 44, row++)
            for (let x = row % 2 ? 44 : 22; x < w + 44; x += 44) { ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill(); }
    } else if (pattern === "hearts" || pattern === "stars") {
        ctx.globalAlpha = 0.5;
        ctx.font = '34px "Segoe UI Symbol", serif';
        const glyph = pattern === "hearts" ? "♥" : "★";
        for (let y = 30, row = 0; y < h + 76; y += 76, row++)
            for (let x = row % 2 ? 76 : 38; x < w + 76; x += 76) ctx.fillText(glyph, x, y);
    } else if (pattern === "stripes") {
        ctx.globalAlpha = 0.35;
        for (let x = 0; x < w; x += 56) ctx.fillRect(x, 0, 28, h);
    } else if (pattern === "checks") {
        ctx.globalAlpha = 0.22;
        for (let x = 0; x < w; x += 48) ctx.fillRect(x, 0, 24, h);
        for (let y = 0; y < h; y += 48) ctx.fillRect(0, y, w, 24);
    } else if (pattern === "sprockets") {
        ctx.globalAlpha = 0.9;
        for (let y = 22; y < h; y += 56) { ctx.fillRect(14, y, 22, 32); ctx.fillRect(w - 36, y, 22, 32); }
    } else if (pattern === "sprockets") {
        ctx.globalAlpha = 0.9;
        for (let y = 22; y < h; y += 56) { ctx.fillRect(14, y, 22, 32); ctx.fillRect(w - 36, y, 22, 32); }
    } else if (pattern === "glitter") {
        // Seeded random, so the sparkles stay in the same place on every re-render (no flicker).
        let seed = 7;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const count = Math.round((w * h) / 2200);
        for (let i = 0; i < count; i++) {
            const x = rnd() * w, y = rnd() * h, r = 1.5 + rnd() * 4.5;
            ctx.globalAlpha = 0.3 + rnd() * 0.7;
            ctx.fillStyle = rnd() < 0.35 ? "#ffffff" : accent;
            if (rnd() < 0.28) {
                // 4-point sparkle
                const long = r * 2.4, short = r * 0.5;
                ctx.beginPath();
                ctx.moveTo(x, y - long); ctx.lineTo(x + short, y - short);
                ctx.lineTo(x + long, y); ctx.lineTo(x + short, y + short);
                ctx.lineTo(x, y + long); ctx.lineTo(x - short, y + short);
                ctx.lineTo(x - long, y); ctx.lineTo(x - short, y - short);
                ctx.closePath();
                ctx.fill();
            } else {
                ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.fill();
            }
        }
    }
    ctx.restore();
}


function drawBackground(ctx, w, h) {
    const look = resolveLook();
    const gradient = ctx.createLinearGradient(0, 0, w * 0.3, h);
    gradient.addColorStop(0, look.bg1);
    gradient.addColorStop(1, look.bg2);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    drawPattern(ctx, w, h, look.frame.pattern, look.frame.accent);
}

async function applyBoothConfig(config = null, updatedAt = null) {
    if (!config) {
        try {
            const response = await fetch("/api/config", { cache: "no-store" });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Could not load shared settings.");
            config = result.config;
            updatedAt = result.updatedAt;
        } catch (error) {
            if (!["localhost", "127.0.0.1", "::1"].includes(location.hostname) && !error.message.includes("not configured")) {
                console.error("Could not load shared photobooth settings", error);
                document.querySelector(".layout-grid").innerHTML = '<p class="hint" role="alert">Photobooth settings are temporarily unavailable. Please reload this page or contact the administrator.</p>';
                return;
            }
            console.warn("Using local photobooth settings because shared settings are not configured", error);
            config = XenConfig.load();
            sharedSettingsSyncEnabled = false;
        }
    }
    boothConfig = config;
    sharedConfigUpdatedAt = updatedAt ? new Date(updatedAt).getTime() : null;
    XenConfig.save(boothConfig);
    activeTemplate = XenConfig.activeTemplate(boothConfig);
    templateLogo = null;
    if (activeTemplate?.logo) {
        const img = new Image();
        img.addEventListener("load", () => { templateLogo = img; renderFinalCanvas(); });
        img.src = activeTemplate.logo;
    }
    buildLayoutCards();
    buildFramePicker();
    applyTemplateDefaults();
    applyLayoutPhotoLimit();
}

window.setInterval(async () => {
    if (isCapturing || !sharedSettingsSyncEnabled) return;
    try {
        const response = await fetch("/api/config", { cache: "no-store" });
        if (!response.ok) throw new Error(`Settings request failed (${response.status}).`);
        const result = await response.json();
        const updatedAt = result.updatedAt ? new Date(result.updatedAt).getTime() : null;
        if (updatedAt !== sharedConfigUpdatedAt) await applyBoothConfig(result.config, result.updatedAt);
    } catch (error) {
        console.warn("Could not refresh shared photobooth settings", error);
    }
}, 15000);

window.addEventListener("storage", (event) => {
    if (event.key === XenConfig.KEY && !isCapturing && !sharedSettingsSyncEnabled) {
        applyBoothConfig(XenConfig.load());
    }
});