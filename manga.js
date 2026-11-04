/* =====================================================
   FICHE D'UN MANGA : chiffres, avis, favori, chapitres
   Adresse : manga.html?id=ishi-no-erito
===================================================== */
(function () {
    "use strict";

    const root = document.getElementById("fiche");
    const id = new URLSearchParams(location.search).get("id");

    const el = (tag, cls, text) => {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    };
    const icon = cls => el("i", "fa-solid " + cls);
    const compact = n => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);

    function section(iconClass, title) {
        const s = el("section", "content-section");
        const bar = el("div", "identity-bar");
        const h = el("h2");
        h.append(icon(iconClass), " " + title);
        bar.append(h);
        const box = el("div", "page-box");
        s.append(bar, box);
        return { s, box };
    }

    function empty(title, text) {
        const { s, box } = section("fa-circle-info", title);
        box.append(el("p", "empty-note", text));
        root.replaceChildren(s);
    }

    async function start() {
        await Mbokal.ready;
        try { await Catalog.ready; } catch (e) { /* catalogue de départ */ }
        const m = (window.MANGAS || []).find(x => x.id === id);
        if (!m) { empty("Manga introuvable", "Ce lien ne correspond à aucun manga du catalogue."); return; }

        document.title = m.titre + " — MANGA MBOKAL EDITION";
        const frag = document.createDocumentFragment();

        /* ----- En-tête ----- */
        const head = el("div", "fiche-head");
        const cover = el("div", "fiche-cover");
        if (m.couverture) cover.style.backgroundImage = "url(\"" + m.couverture.replace(/"/g, "%22") + "\")";
        const info = el("div", "fiche-info");
        const kind = (m.type === "novel" ? ["Light novel"] : []).concat(m.genres ? [m.genres] : []).join(" • ");
        info.append(el("h1", null, m.titre), el("p", "fiche-genres", kind));
        if (m.description) info.append(el("p", "fiche-desc", m.description));
        head.append(cover, info);

        /* ----- Chiffres ----- */
        const tiles = {};
        const grid = el("div", "stat-grid");
        [["vues", "fa-eye", "Vues"], ["lus", "fa-book-open", "Lectures"], ["favoris", "fa-heart", "Favoris"]].forEach(([k, ic, label]) => {
            const t = el("div", "stat");
            const b = el("b", null, "–");
            t.append(icon(ic), b, el("span", null, label));
            tiles[k] = b;
            grid.append(t);
        });

        /* ----- Avis ----- */
        const up = el("button", "rate-btn"), down = el("button", "rate-btn");
        up.type = down.type = "button";
        up.setAttribute("aria-label", "J'aime ce manga");
        down.setAttribute("aria-label", "Je n'aime pas ce manga");
        const upN = el("span", null, "0"), downN = el("span", null, "0");
        up.append(icon("fa-thumbs-up"), upN);
        down.append(icon("fa-thumbs-down"), downN);
        const rateLine = el("div", "rate-line");
        rateLine.append(up, down);

        let mine = 0, sum = { likes: 0, dislikes: 0 };
        const paintRate = () => {
            up.setAttribute("aria-pressed", String(mine === 1));
            down.setAttribute("aria-pressed", String(mine === -1));
            upN.textContent = compact(sum.likes);
            downN.textContent = compact(sum.dislikes);
        };
        async function refresh() {
            try {
                const s = await Mbokal.stats.summary(m.id);
                tiles.vues.textContent = compact(s.vues);
                tiles.lus.textContent = compact(s.lus);
                tiles.favoris.textContent = compact(s.favoris);
                sum = { likes: s.likes, dislikes: s.dislikes };
            } catch (ex) { /* chiffres indisponibles : on garde les tirets */ }
            mine = await Mbokal.stats.myRating(m.id);
            paintRate();
        }
        const vote = async v => {
            try {
                await Mbokal.stats.rate(m.id, mine === v ? 0 : v);
                await refresh();
            } catch (ex) { Mbokal.toast(ex.message); }
        };
        up.addEventListener("click", () => vote(1));
        down.addEventListener("click", () => vote(-1));
        paintRate();

        /* ----- Boutons : lire et favori ----- */
        const actions = el("div", "fiche-actions");
        const progress = (await Mbokal.progress().catch(() => ({})))[m.id];
        const readable = m.chapitres.some(c => !c.brouillon && c.disponible && (c.pages.length || c.placeholder || c.texte));
        if (readable) {
            const read = el("a", "btn-main", progress ? "Reprendre" : "Commencer la lecture");
            read.href = "lecteur.html?manga=" + encodeURIComponent(m.id);
            actions.append(read);
        }
        const fav = el("button", "btn-soft");
        fav.type = "button";
        const paintFav = on => { fav.textContent = on ? "Dans mes favoris" : "Ajouter aux favoris"; fav.setAttribute("aria-pressed", String(on)); };
        paintFav((await Mbokal.favorites().catch(() => [])).indexOf(m.id) !== -1);
        fav.addEventListener("click", async () => {
            try { paintFav(await Mbokal.toggleFavorite(m.id)); refresh(); }
            catch (ex) { Mbokal.toast("Impossible de modifier les favoris. Réessaie."); }
        });
        actions.append(fav);

        const top = section("fa-chart-simple", "Statistiques");
        top.box.append(grid, rateLine);

        /* ----- Chapitres ----- */
        const chs = section("fa-layer-group", "Chapitres");
        const list = m.chapitres.filter(c => !c.brouillon);
        if (!list.length) {
            chs.box.append(el("p", "empty-note", "Pas encore de chapitre"));
        } else {
            const ul = el("ul", "row-list");
            const lus = (progress && progress.lus) || [];
            list.forEach(c => {
                const li = el("li");
                const ok = c.disponible && (c.pages.length || c.placeholder || c.texte);
                const text = el("div", "row-text");
                text.append(el("strong", null, "Chapitre " + c.numero + " — " + c.titre),
                            el("span", null, !ok ? "Bientôt" : lus.indexOf(c.numero) !== -1 ? "Lu" : ""));
                li.append(text);
                if (ok) {
                    const a = el("a", "row-action");
                    a.href = "lecteur.html?manga=" + encodeURIComponent(m.id) + "&chapitre=" + c.numero;
                    a.append(icon("fa-play"), " Lire");
                    li.append(a);
                }
                ul.append(li);
            });
            chs.box.append(ul);
        }

        const wrap = el("section", "content-section");
        const box = el("div", "page-box");
        box.append(head, actions);
        wrap.append(box);
        frag.append(wrap, top.s, chs.s);
        root.replaceChildren(frag);
        if (window.MbokalPub) MbokalPub.characters(root, m.id);          // personnages de cette œuvre
        refresh();
        Mbokal.onChange(() => { refresh(); });
    }

    start();
})();
