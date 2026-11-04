/* =====================================================
   PUBLICATIONS : actualités, annonces, événements,
   personnages (liés à une œuvre) et bannières de l'accueil.
   Un conteneur de page se déclare ainsi :
     <div data-publications data-types="actualite,annonce"
          data-layout="list|events|grid|characters|latest|banner"
          data-limit="3" data-title="Actualités" data-icon="fa-newspaper"
          data-fallback="#statique"></div>
   S'il n'y a aucune publication, la partie « fallback » (texte écrit
   dans la page) reste affichée. Tout le texte passe par textContent.
===================================================== */
(function () {
    "use strict";

    const TYPE_LABEL = { actualite: "Actualité", annonce: "Annonce", evenement: "Événement", personnage: "Personnage", banniere: "Bannière" };
    const LOCALES = { fr: "fr", en: "en", pt: "pt", sw: "sw", ln: "fr" };

    const el = (tag, cls, text) => {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    };

    function locale() {
        try { return LOCALES[localStorage.getItem("mbokal:lang")] || "fr"; } catch (e) { return "fr"; }
    }
    function fmtDate(iso) {
        if (!iso) return "";
        const d = new Date(String(iso).length === 10 ? iso + "T00:00:00" : iso);
        if (isNaN(d)) return "";
        try { return d.toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" }); }
        catch (e) { return d.toLocaleDateString("fr"); }
    }
    // La date est déjà écrite dans la langue du lecteur : elle ne doit pas être traduite une seconde fois
    function dateSpan(iso) {
        const s = el("span", "pub-date", fmtDate(iso));
        s.setAttribute("translate", "no");
        return s;
    }
    const detailHref = id => "publication.html?id=" + encodeURIComponent(id);
    const today = () => new Date().toISOString().slice(0, 10);
    const byDate = (a, b) => (a.created_at < b.created_at ? 1 : -1);
    const workOf = id => (window.MANGAS || []).find(m => m.id === id) || null;

    // Les liens saisis par l'équipe sont déjà contrôlés par la base ; on revérifie ici
    function safeHref(lien) {
        return /^(https:\/\/\S+|[a-z0-9_.-]+\.html(\?[a-zA-Z0-9=&%._-]*)?)$/.test(lien || "") ? lien : null;
    }
    function link(a, href) {
        a.href = href;
        if (href.indexOf("https://") === 0) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    }
    function targetOf(p) {
        const own = safeHref(p.lien);
        if (own) return own;
        if (p.manga_id) return "manga.html?id=" + encodeURIComponent(p.manga_id);
        return null;
    }

    /* ---------- Tri ---------- */
    function sortItems(layout, items) {
        const list = items.slice();
        if (layout === "events") {
            const t = today();
            const up = list.filter(p => !p.date_evenement || p.date_evenement >= t)
                .sort((a, b) => String(a.date_evenement || "9999").localeCompare(String(b.date_evenement || "9999")));
            const past = list.filter(p => p.date_evenement && p.date_evenement < t)
                .sort((a, b) => b.date_evenement.localeCompare(a.date_evenement));
            return up.concat(past);
        }
        if (layout === "grid" || layout === "characters" || layout === "banner") {
            return list.sort((a, b) => ((a.ordre || 0) - (b.ordre || 0)) || (layout === "banner" ? byDate(a, b) : a.titre.localeCompare(b.titre)));
        }
        return list.sort((a, b) => (Number(b.epingle) - Number(a.epingle)) || byDate(a, b));
    }

    /* ---------- Éléments ---------- */
    function card(p, layout) {
        const a = el("a", "pub-card" + (layout === "latest" ? " compact" : ""));
        a.href = detailHref(p.id);
        if (p.url) {
            const im = el("img", "pub-img");
            im.src = p.url; im.alt = ""; im.loading = "lazy";
            a.append(im);
        }
        const body = el("div", "pub-body");
        const meta = el("div", "pub-meta");
        meta.append(el("span", "pub-badge", TYPE_LABEL[p.type] || ""));
        if (p.epingle) { const pin = el("span", "pub-badge", "📌"); pin.setAttribute("aria-hidden", "true"); meta.append(pin); }
        if (layout === "events" && p.date_evenement && p.date_evenement < today()) meta.append(el("span", "pub-badge past", "Terminé"));
        const when = p.type === "evenement" ? p.date_evenement : p.created_at;
        if (when) meta.append(dateSpan(when));
        body.append(meta, el("h3", null, p.titre));
        if (p.resume) body.append(el("p", "pub-resume", p.resume));
        body.append(el("span", "pub-more", "Lire la suite"));
        a.append(body);
        return a;
    }

    function portrait(p) {
        const a = el("a", "pub-portrait");
        a.href = detailHref(p.id);
        if (p.url) {
            const im = el("img");
            im.src = p.url; im.alt = ""; im.loading = "lazy";
            a.append(im);
        } else {
            a.append(el("div", "pub-noimg", (p.titre || "?").charAt(0).toUpperCase()));
        }
        const cap = el("div", "pub-cap");
        cap.append(el("strong", null, p.titre));
        if (p.resume) cap.append(el("span", null, p.resume));
        a.append(cap);
        return a;
    }

    function grid(list) {
        const g = el("div", "pub-grid");
        list.forEach(p => g.append(portrait(p)));
        return g;
    }

    function banner(list) {
        const wrap = el("div", "banner");
        const track = el("div", "banner-track");
        list.forEach(p => {
            const href = targetOf(p);
            const slide = el(href ? "a" : "div", "banner-slide");
            if (href) link(slide, href);
            if (p.url) { const im = el("img"); im.src = p.url; im.alt = ""; slide.append(im); }
            const cap = el("div", "banner-cap");
            cap.append(el("strong", null, p.titre));
            if (p.resume) cap.append(el("span", null, p.resume));
            slide.append(cap);
            track.append(slide);
        });
        wrap.append(track);
        return wrap;
    }

    function section(title, icon) {
        const s = el("section", "content-section");
        if (title) {
            const bar = el("div", "identity-bar");
            const h = el("h2");
            h.append(el("i", "fa-solid " + (icon || "fa-newspaper")), " " + title);
            bar.append(h);
            s.append(bar);
        }
        const box = el("div", "page-box");
        s.append(box);
        return { s, box };
    }

    // Personnages regroupés par œuvre
    function groupedCharacters(box, items) {
        const groups = [];
        const known = new Map();
        (window.MANGAS || []).forEach(m => { const g = { work: m, items: [] }; known.set(m.id, g); groups.push(g); });
        const other = { work: null, items: [] };
        items.forEach(p => { const g = p.manga_id && known.get(p.manga_id); (g || other).items.push(p); });
        groups.push(other);
        groups.filter(g => g.items.length).forEach(g => {
            const head = g.work ? el("a", "pub-group", g.work.titre) : el("p", "pub-group", "Autres personnages");
            if (g.work) { head.href = "manga.html?id=" + encodeURIComponent(g.work.id); head.setAttribute("translate", "no"); }
            box.append(head, grid(g.items));
        });
    }

    /* ---------- Montage d'un conteneur ---------- */
    async function mount(c) {
        const types = (c.dataset.types || "").split(",").filter(Boolean);
        const layout = c.dataset.layout || "list";
        const limit = Number(c.dataset.limit) || 0;
        let items = [];
        try { items = await Catalog.publications({ types }); } catch (e) { items = []; }
        if (!items.length) return;                              // la version écrite dans la page reste affichée

        items = sortItems(layout, items);
        if (limit) items = items.slice(0, limit);

        if (layout === "banner") {
            c.replaceChildren(banner(items));
        } else {
            const { s, box } = section(c.dataset.title, c.dataset.icon);
            const draw = list => {
                box.querySelectorAll(".pub-list, .pub-grid, .pub-group").forEach(n => n.remove());
                if (layout === "characters") { groupedCharacters(box, list); return; }
                if (layout === "grid") { box.append(grid(list)); return; }
                const l = el("div", "pub-list");
                list.forEach(p => l.append(card(p, layout)));
                box.append(l);
            };
            // Onglets « Tout / Actualités / Annonces » quand les deux types existent
            if (layout === "list" && types.length > 1 && new Set(items.map(p => p.type)).size > 1) {
                const tabs = el("div", "auth-tabs");
                tabs.setAttribute("role", "tablist");
                [["", "Tout"], ["actualite", "Actualités"], ["annonce", "Annonces"]].forEach(([key, label]) => {
                    const b = el("button", null, label);
                    b.type = "button";
                    b.setAttribute("role", "tab");
                    b.setAttribute("aria-selected", String(key === ""));
                    b.addEventListener("click", () => {
                        tabs.querySelectorAll("button").forEach(x => x.setAttribute("aria-selected", String(x === b)));
                        draw(key ? items.filter(p => p.type === key) : items);
                    });
                    tabs.append(b);
                });
                box.append(tabs);
            }
            draw(items);
            c.replaceChildren(s);
        }
        if (c.dataset.fallback) document.querySelectorAll(c.dataset.fallback).forEach(n => { n.style.display = "none"; });
    }

    /* ---------- Personnages d'une œuvre (fiche) ---------- */
    async function characters(root, mangaId) {
        let items = [];
        try { items = await Catalog.publications({ types: ["personnage"], manga: mangaId }); } catch (e) { items = []; }
        if (!items.length) return;
        const { s, box } = section("Personnages", "fa-user-group");
        box.append(grid(sortItems("grid", items)));
        root.append(s);
    }

    /* ---------- Page de détail ---------- */
    async function detail(root) {
        const params = new URLSearchParams(location.search);
        const id = params.get("id");
        let p = null;
        try {
            await Mbokal.ready;
            if (params.get("apercu") && await Catalog.admin.isTeam()) {
                const all = await Catalog.admin.publications();
                p = all.map(x => Object.assign({}, x, { url: x.image && x.image.url })).find(x => x.id === id) || null;
            } else {
                p = (await Catalog.publications({})).find(x => x.id === id) || null;
            }
        } catch (e) { p = null; }

        if (!p) {
            const box = el("div", "empty");
            box.append(el("h2", null, "Publication introuvable"));
            const a = el("a", null, "Retour à l'accueil");
            a.href = "index.html";
            box.append(a);
            root.replaceChildren(box);
            return;
        }

        const wrap = el("article", "pub-detail");
        const meta = el("div", "pub-meta");
        meta.append(el("span", "pub-badge", TYPE_LABEL[p.type] || ""));
        if (p.statut !== "publie") meta.append(el("span", "pub-badge past", "Brouillon"));
        const when = p.type === "evenement" ? p.date_evenement : p.created_at;
        if (when && p.type !== "personnage") meta.append(dateSpan(when));
        wrap.append(meta, el("h1", null, p.titre));
        if (p.url) { const im = el("img", "pub-full"); im.src = p.url; im.alt = p.titre; wrap.append(im); }
        if (p.resume) wrap.append(el("p", "pub-lead", p.resume));
        if (p.texte) {
            const body = el("div", "pub-text");
            if (window.MbokalTexte) MbokalTexte.render(body, p.texte); else body.textContent = p.texte;
            wrap.append(body);
        }
        const w = p.manga_id && workOf(p.manga_id);
        const href = targetOf(p);
        if (href) {
            const a = el("a", "btn-main", w && !safeHref(p.lien) ? "Voir la fiche" : "En savoir plus");
            link(a, href);
            a.style.cssText = "display:block;text-align:center;margin-top:18px;";
            wrap.append(a);
        }
        if (p.type !== "personnage" && p.type !== "banniere" && p.auteur) wrap.append(el("p", "pub-by", "par " + p.auteur));
        root.replaceChildren(wrap);
        document.title = p.titre + " — MANGA MBOKAL EDITION";
    }

    window.MbokalPub = { characters };

    /* ---------- Démarrage ---------- */
    async function start() {
        await Mbokal.ready;
        try { await Catalog.ready; } catch (e) { /* catalogue de départ */ }
        document.querySelectorAll("[data-publications]").forEach(mount);
        const d = document.getElementById("publication");
        if (d) detail(d);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
