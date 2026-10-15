// config.js - shared settings (layouts, frames, templates) and admin auth.
// Read by the photobooth, written only by the admin page.
// ONLY settings are stored here. User photos never pass through or get saved here.
const XenConfig = (() => {
    const KEY = "xenBoothConfig";
    const TYPE_COUNTS = { strip: 3, grid: 4, polaroid: 2, square: 4 };
    const PATTERNS = { none: "None", dots: "Polka dots", hearts: "Hearts", stars: "Stars", stripes: "Stripes", checks: "Gingham", sprockets: "Film holes", glitter: "Glitter" };
    const GLYPHS = { none: "", dots: "•", hearts: "♥", stars: "★", stripes: "≡", checks: "▦", sprockets: "▮", glitter: "✦" };

    // Frames are full-background designs: bg -> bg2 gradient (same color = solid) + a repeating pattern.
    const frame = (id, name, bg, bg2, pattern, accent) => ({ id, name, builtin: true, active: true, bg, bg2, pattern, accent });
    const defaultTemplate = () => ({
        id: "tpl_default", name: "Xen Classic", layoutType: "strip",
        bg: "#fffaf7", textColor: "#59645e", brandText: "XEN PHOTOBOOTH",
        eventName: "made with love", frameId: "blush", logo: null
    });

    const defaults = () => ({
        layouts: [
            { id: "strip", name: "2 × 6 photostrip", desc: "Classic booth energy", active: true },
            { id: "grid", name: "4-photo grid", desc: "Balanced and bright", active: true },
            { id: "polaroid", name: "Polaroid style", desc: "Loose, lovely, nostalgic", active: true },
            { id: "square", name: "Square collage", desc: "Made for your feed", active: true }
        ],
        frames: [
            frame("none", "No frame", "#fffaf7", "#fffaf7", "none", "#e7a8b9"),
            frame("blush", "Blush Hearts", "#fbdde5", "#fbdde5", "hearts", "#e58fa8"),
            frame("mint", "Mint Dots", "#cfe7d9", "#cfe7d9", "dots", "#ffffff"),
            frame("gingham", "Pink Gingham", "#fde7ee", "#fde7ee", "checks", "#e7a8b9"),
            frame("stripes", "Candy Stripes", "#fff0f3", "#fff0f3", "stripes", "#f4a9bd"),
            frame("film", "Film Strip", "#1f2926", "#1f2926", "sprockets", "#f7eee9"),
            frame("night", "Starry Night", "#26335a", "#3b2f63", "stars", "#ffe9a8"),
            frame("sunset", "Peach Sunset", "#ffd9c2", "#f6b3c6", "none", "#ffffff"),
            frame("glitter", "Pink Glitter", "#f9c6d6", "#f3a6c0", "glitter", "#ffffff"),
            frame("gold", "Gold Glitter", "#f6e3b4", "#e8c77a", "glitter", "#fff8e1"),
            frame("galaxy", "Galaxy Glitter", "#2b2150", "#4a2c7a", "glitter", "#ffe9ff")
        ],
        templates: [defaultTemplate()],
        activeTemplateId: "tpl_default",
        seeded: true
    });

    function load() {
        const base = defaults();
        try {
            const saved = JSON.parse(localStorage.getItem(KEY) || "null");
            if (!saved) return base;
            base.layouts = base.layouts.map((l) => ({ ...l, ...(saved.layouts || []).find((s) => s.id === l.id) }));
            const savedFrames = saved.frames || [];
            const customFrames = savedFrames.filter((f) => !f.builtin).map((f) => {
                const bg = f.bg || "#fbdde5"; // migrate old border-style frames
                return { ...f, builtin: false, bg, bg2: f.bg2 || bg, pattern: f.pattern || "hearts", accent: f.accent || f.color || "#e58fa8" };
            });
            base.frames = [
                ...base.frames.map((f) => ({ ...f, ...(savedFrames.find((s) => s.id === f.id) || {}) })),
                ...customFrames
            ];
            base.frames.find((f) => f.id === "none").active = true;
            base.templates = saved.templates || [];
            base.activeTemplateId = saved.activeTemplateId || null;
            // One-time: add the default template for configs saved before it existed.
            if (!saved.seeded) {
                if (!base.templates.some((t) => t.id === "tpl_default")) base.templates.unshift(defaultTemplate());
                if (!base.activeTemplateId) base.activeTemplateId = "tpl_default";
            }
            base.templates.forEach((t) => { if (!base.frames.some((f) => f.id === t.frameId)) t.frameId = "none"; });
        } catch (error) {
            console.warn("Config reset to defaults", error);
        }
        return base;
    }

    function save(config) {
        try { localStorage.setItem(KEY, JSON.stringify(config)); return true; } catch (error) { console.error(error); return false; }
    }

    const activeTemplate = (config) => config.templates.find((t) => t.id === config.activeTemplateId) || null;
    const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

    const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c)) ? c : "#ffffff");
    function isDark(hex) {
        let h = safeColor(hex).slice(1);
        if (h.length === 3) h = h.split("").map((x) => x + x).join("");
        const n = parseInt(h.slice(0, 6), 16);
        const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
        return lum < 0.5;
    }
    // Small preview used by both the admin page and the photobooth frame picker.
    function swatchHtml(f) {
        const bg = safeColor(f.bg), bg2 = safeColor(f.bg2 || f.bg), accent = safeColor(f.accent);
        return `<span class="frame-swatch" style="border:3px solid ${accent};background:linear-gradient(160deg,${bg},${bg2});color:${accent};display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1">${GLYPHS[f.pattern] || ""}</span>`;
    }

    return { KEY, TYPE_COUNTS, PATTERNS, defaults, load, save, activeTemplate, uid, safeColor, isDark, swatchHtml };
})();
