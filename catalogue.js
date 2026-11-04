/* =====================================================
   CATALOGUE — mangas et chapitres du site
   Rassemble :
   - mangas.js            (contenu de départ, pages de test)
   - la base de données   (chapitres publiés par l'équipe)
   et remplit window.MANGAS, que le reste du site lit.

   Deux sources, selon config.js :
   - cloud : Supabase (base + stockage des images)
   - local : démo, tout reste sur l'appareil (IndexedDB)

   Catalog.ready          -> promesse : catalogue chargé
   Catalog.load(options)  -> recharge ({ brouillons: true } pour l'aperçu équipe)
   Catalog.renderCards(el)-> ajoute les cartes des mangas créés par l'équipe
   Catalog.admin          -> fonctions réservées à l'atelier
===================================================== */
(function () {
    "use strict";

    const STATIC = JSON.parse(JSON.stringify(window.MANGAS || []));
    const STATIC_IDS = new Set(STATIC.map(m => m.id));
    window.MANGAS = window.MANGAS || [];

    const ck = r => { if (r.error) throw r.error; return r.data; };
    const rand = () => Math.random().toString(36).slice(2, 8);

    /* ---------- IndexedDB (mode démo) ---------- */
    let dbPromise = null;
    function db() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const r = indexedDB.open("mbokal-atelier", 3);
                r.onupgradeneeded = () => {
                    const d = r.result;
                    const mk = (name, opts) => { if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, opts); };
                    mk("mangas", { keyPath: "id" });
                    mk("chapitres", { keyPath: "key" });
                    mk("blobs");
                    mk("illustrations", { keyPath: "id" });
                    mk("publications", { keyPath: "id" });
                };
                r.onsuccess = () => resolve(r.result);
                r.onerror = () => reject(r.error);
            });
        }
        return dbPromise;
    }
    function tx(store, mode, fn) {
        return db().then(d => new Promise((resolve, reject) => {
            const t = d.transaction(store, mode);
            const req = fn(t.objectStore(store));
            t.oncomplete = () => resolve(req && req.result);
            t.onerror = () => reject(t.error);
            t.onabort = () => reject(t.error);
        }));
    }
    const idb = {
        all: s => tx(s, "readonly", o => o.getAll()),
        get: (s, k) => tx(s, "readonly", o => o.get(k)),
        put: (s, v, k) => tx(s, "readwrite", o => (k === undefined ? o.put(v) : o.put(v, k))),
        del: (s, k) => tx(s, "readwrite", o => o.delete(k))
    };

    /* ---------- Source : démo (appareil) ---------- */
    const localDriver = {
        async isTeam() { return !!Mbokal.user(); },     // démo : tout compte connecté peut tester l'atelier
        async url(ref) {
            if (!ref) return null;
            if (ref.indexOf("idb:") === 0) {
                const blob = await idb.get("blobs", ref.slice(4));
                return blob ? URL.createObjectURL(blob) : null;
            }
            return ref;
        },
        rawMangas: () => idb.all("mangas"),
        async rawChapters(opts) {
            return (await idb.all("chapitres")).filter(c => opts.brouillons || c.statut === "publie");
        },
        async saveManga(m) {
            const old = await idb.get("mangas", m.id);
            const u = Mbokal.user();
            await idb.put("mangas", {
                id: m.id, titre: m.titre, genres: m.genres, sens: m.sens, couverture: m.couverture || null,
                type: m.type || (old && old.type) || "manga",
                description: m.description !== undefined ? m.description : ((old && old.description) || ""),
                cree_par: (old && old.cree_par) || (u && u.id) || null
            });
        },
        async deleteManga(id) { await idb.del("mangas", id); },
        rawIllustrations: () => idb.all("illustrations"),
        async saveIllustration(i) {
            const old = i.id ? await idb.get("illustrations", i.id) : null;
            const u = Mbokal.user();
            const row = {
                id: i.id || "i" + Date.now().toString(36) + rand(),
                titre: i.titre, description: i.description || "", image: i.image, manga_id: i.manga_id || null, statut: i.statut,
                auteur: (old && old.auteur) || (u && u.pseudo) || "Équipe",
                cree_par: (old && old.cree_par) || (u && u.id) || null,
                created_at: (old && old.created_at) || new Date().toISOString()
            };
            await idb.put("illustrations", row);
            return row;
        },
        async deleteIllustration(id) { await idb.del("illustrations", id); },
        rawPublications: () => idb.all("publications"),
        async savePublication(p) {
            const old = p.id ? await idb.get("publications", p.id) : null;
            const u = Mbokal.user();
            const row = {
                id: p.id || "p" + Date.now().toString(36) + rand(),
                type: p.type, titre: p.titre, resume: p.resume || "", texte: p.texte || "", image: p.image || null,
                lien: p.lien || "", manga_id: p.manga_id || null, date_evenement: p.date_evenement || null,
                epingle: !!p.epingle, ordre: Number(p.ordre) || 0, statut: p.statut,
                auteur: (old && old.auteur) || (u && u.pseudo) || "Équipe",
                cree_par: (old && old.cree_par) || (u && u.id) || null,
                created_at: (old && old.created_at) || new Date().toISOString()
            };
            await idb.put("publications", row);
            return row;
        },
        async deletePublication(id) { await idb.del("publications", id); },
        saveChapter: c => idb.put("chapitres", Object.assign({ key: c.manga_id + ":" + c.numero }, c)),
        async deleteChapter(mangaId, numero) { await idb.del("chapitres", mangaId + ":" + numero); },
        async upload(mangaId, blob) {
            const id = Date.now().toString(36) + "-" + rand();
            await idb.put("blobs", blob, id);
            return "idb:" + id;
        },
        async removeFiles(refs) { for (const r of refs) if (r && r.indexOf("idb:") === 0) await idb.del("blobs", r.slice(4)); }
    };

    /* ---------- Source : Supabase ---------- */
    const sbc = () => Mbokal._sb();
    const cloudDriver = {
        async isTeam() {
            const u = Mbokal.user();
            if (!u) return false;
            const r = await sbc().from("equipe").select("user_id").eq("user_id", u.id).maybeSingle();
            return !r.error && !!r.data;
        },
        url(ref) { return ref ? sbc().storage.from("pages").getPublicUrl(ref).data.publicUrl : null; },
        async rawMangas() { return ck(await sbc().from("mangas").select("*").order("created_at")); },
        async rawChapters(opts) {
            const run = cols => {
                let q = sbc().from("chapitres").select(cols);
                if (!opts.brouillons) q = q.eq("statut", "publie");
                return q;
            };
            // Colonnes ajoutées au fil du temps : si la base n'est pas à jour, on lit sans elles
            const tries = ["manga_id,numero,titre,pages,statut,pages_langues,texte", "manga_id,numero,titre,pages,statut,pages_langues", "manga_id,numero,titre,pages,statut"];
            let r;
            for (const cols of tries) {
                r = await run(cols);
                if (!r.error || !/pages_langues|texte/i.test(r.error.message || "")) break;
            }
            return ck(r);
        },
        async saveManga(m) {
            const row = { id: m.id, titre: m.titre, genres: m.genres, sens: m.sens, couverture: m.couverture || null };
            if (m.type !== undefined) row.type = m.type;                   // seulement ce qui est fourni :
            if (m.description !== undefined) row.description = m.description;   // le reste ne change pas
            let r = await sbc().from("mangas").upsert(row, { onConflict: "id" });
            // Base pas encore mise à jour : on enregistre sans les colonnes récentes
            if (r.error && /\b(type|description)\b/i.test(r.error.message || "") && row.type !== "novel") {
                delete row.type; delete row.description;
                r = await sbc().from("mangas").upsert(row, { onConflict: "id" });
            }
            ck(r);
        },
        async rawIllustrations() { return ck(await sbc().from("illustrations").select("*").order("created_at", { ascending: false })); },
        async saveIllustration(i) {
            const row = { titre: i.titre, description: i.description || "", image: i.image, manga_id: i.manga_id || null, statut: i.statut };
            if (i.id) { ck(await sbc().from("illustrations").update(row).eq("id", i.id)); return Object.assign({ id: i.id }, row); }
            return ck(await sbc().from("illustrations").insert(row).select("*").single());
        },
        async deleteIllustration(id) { ck(await sbc().from("illustrations").delete().eq("id", id)); },
        async rawPublications() { return ck(await sbc().from("publications").select("*").order("created_at", { ascending: false })); },
        async savePublication(p) {
            const row = {
                type: p.type, titre: p.titre, resume: p.resume || "", texte: p.texte || "", image: p.image || null,
                lien: p.lien || "", manga_id: p.manga_id || null, date_evenement: p.date_evenement || null,
                epingle: !!p.epingle, ordre: Number(p.ordre) || 0, statut: p.statut
            };
            if (p.id) { ck(await sbc().from("publications").update(row).eq("id", p.id)); return Object.assign({ id: p.id }, row); }
            return ck(await sbc().from("publications").insert(row).select("*").single());
        },
        async deletePublication(id) { ck(await sbc().from("publications").delete().eq("id", id)); },
        async deleteManga(id) { ck(await sbc().from("mangas").delete().eq("id", id)); },
        async saveChapter(c) {
            const row = { manga_id: c.manga_id, numero: c.numero, titre: c.titre, pages: c.pages, statut: c.statut,
                          pages_langues: c.pages_langues || {} };
            if (c.texte !== undefined) row.texte = c.texte;
            let r = await sbc().from("chapitres").upsert(row, { onConflict: "manga_id,numero" });
            // Colonne récente absente et rien à y enregistrer : on enregistre sans
            if (r.error && /pages_langues|texte/i.test(r.error.message || "")) {
                if (!Object.keys(row.pages_langues).length) delete row.pages_langues;
                if (!row.texte) delete row.texte;
                r = await sbc().from("chapitres").upsert(row, { onConflict: "manga_id,numero" });
            }
            ck(r);
        },
        async deleteChapter(mangaId, numero) {
            ck(await sbc().from("chapitres").delete().eq("manga_id", mangaId).eq("numero", numero));
        },
        async upload(mangaId, blob, ext) {
            const path = mangaId + "/" + Date.now().toString(36) + "-" + rand() + "." + ext;
            const r = await sbc().storage.from("pages").upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
            if (r.error) throw r.error;
            return path;
        },
        async removeFiles(refs) {
            const list = refs.filter(Boolean);
            if (list.length) await sbc().storage.from("pages").remove(list);
        }
    };

    function driver() {
        const m = Mbokal.mode;
        if (m === "cloud") return cloudDriver;
        if (m === "local") return localDriver;
        return null;                                  // service injoignable : catalogue de départ seulement
    }

    /* ---------- Assemblage ---------- */
    async function fetchRemote(drv, opts) {
        const [ms, cs] = await Promise.all([drv.rawMangas(), drv.rawChapters(opts)]);
        const mangas = await Promise.all(ms.map(async m => ({
            id: m.id, titre: m.titre, genres: m.genres, sens: m.sens, couverture: await drv.url(m.couverture),
            type: m.type || "manga", description: m.description || ""
        })));
        const chapitres = await Promise.all(cs.map(async c => {
            const pagesLangues = {};
            for (const code of Object.keys(c.pages_langues || {})) {
                pagesLangues[code] = await Promise.all((c.pages_langues[code] || []).map(p => drv.url(p)));
            }
            return {
                manga_id: c.manga_id, numero: c.numero, titre: c.titre, statut: c.statut, texte: c.texte || "",
                pages: await Promise.all((c.pages || []).map(p => drv.url(p))),
                pagesLangues
            };
        }));
        return { mangas, chapitres };
    }

    function merge(remote) {
        const out = STATIC.map(m => JSON.parse(JSON.stringify(m)));
        remote.mangas.forEach(m => {
            let t = out.find(x => x.id === m.id);
            if (!t) {
                t = { id: m.id, titre: m.titre, genres: m.genres || "", sens: m.sens || "rtl", chapitres: [] };
                out.push(t);
            } else {
                t.titre = m.titre || t.titre;
                if (m.genres) t.genres = m.genres;
                t.sens = m.sens || t.sens;
            }
            t.couverture = m.couverture || null;
            t.type = m.type || "manga";
            t.description = m.description || "";
            t.dynamique = !STATIC_IDS.has(m.id);
            const chs = remote.chapitres
                .filter(c => c.manga_id === m.id)
                .sort((a, b) => a.numero - b.numero)
                .map(c => ({ numero: c.numero, titre: c.titre, disponible: true, pages: c.pages, pagesLangues: c.pagesLangues || {}, texte: c.texte || "", brouillon: c.statut !== "publie" }));
            if (chs.length) t.chapitres = chs;       // sinon : on garde les pages de test de mangas.js
        });
        return out;
    }

    async function load(opts) {
        opts = opts || {};
        await Mbokal.ready;
        let remote = { mangas: [], chapitres: [] };
        const drv = driver();
        if (drv) { try { remote = await fetchRemote(drv, opts); } catch (e) { /* hors ligne : catalogue de départ */ } }
        const merged = merge(remote);
        window.MANGAS.length = 0;
        merged.forEach(m => window.MANGAS.push(m));
        return window.MANGAS;
    }

    /* ---------- Cartes des mangas créés par l'équipe ---------- */
    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    }

    function renderCards(container) {
        container.querySelectorAll("[data-dynamic]").forEach(n => n.remove());
        const want = container.dataset.catalog === "novel" ? "novel" : "manga";
        const list = window.MANGAS.filter(m => (m.type || "manga") === want && m.dynamique && m.chapitres.some(c => !c.brouillon));
        if (want === "novel" && !list.length) {
            const p = el("p", "empty-note", "Les premiers light novels arrivent bientôt.");
            p.dataset.dynamic = "1";
            container.append(p);
        }
        list.forEach(m => {
            const card = el("article", "manga-card");
            card.dataset.dynamic = "1";
            const cover = el("div", "cover default");
            if (m.couverture) {
                cover.style.backgroundImage = "url(\"" + m.couverture.replace(/"/g, "%22") + "\")";
                cover.style.backgroundSize = "cover";
                cover.style.backgroundPosition = "center";
            }
            const link = el("a", "cover-link");
            link.href = "manga.html?id=" + encodeURIComponent(m.id);
            link.setAttribute("aria-label", "Fiche de " + m.titre);
            cover.append(link);
            const add = el("button", "add-button");
            add.type = "button";
            add.dataset.fav = m.id;
            add.setAttribute("aria-pressed", "false");
            add.setAttribute("aria-label", "Ajouter aux favoris");
            add.append(el("i", "fa-solid fa-plus"));
            cover.append(add, el("div", "cover-title", m.titre));

            const info = el("div", "card-info");
            const read = el("a", "read-button");
            read.href = "lecteur.html?manga=" + encodeURIComponent(m.id);
            read.append(el("i", "fa-solid fa-play"), " LIRE");
            info.append(el("h3", null, m.titre), el("p", null, m.genres), read);

            card.append(cover, info);
            container.append(card);
        });
        if (window.Mbokal && Mbokal.bindFavs) Mbokal.bindFavs();
    }

    /* ---------- Atelier (équipe) ---------- */
    const admin = {
        isTeam: async () => { await Mbokal.ready; const d = driver(); return d ? d.isTeam() : false; },
        async mangas() {
            const d = driver();
            const rows = await d.rawMangas();
            // Les mangas de départ (mangas.js) sont toujours modifiables, même absents de la base
            const have = new Set(rows.map(m => m.id));
            STATIC.forEach(s => { if (!have.has(s.id)) rows.push({ id: s.id, titre: s.titre, genres: s.genres, sens: s.sens, couverture: null }); });
            return Promise.all(rows.map(async m => ({
                id: m.id, titre: m.titre, genres: m.genres, sens: m.sens,
                type: m.type || "manga", description: m.description || "", cree_par: m.cree_par || null,
                couverture: m.couverture ? { ref: m.couverture, url: await d.url(m.couverture) } : null
            })));
        },
        async chapters(mangaId) {
            const d = driver();
            const rows = (await d.rawChapters({ brouillons: true })).filter(c => c.manga_id === mangaId);
            return Promise.all(rows.sort((a, b) => a.numero - b.numero).map(async c => {
                const pagesLangues = {};
                for (const code of Object.keys(c.pages_langues || {})) {
                    pagesLangues[code] = await Promise.all((c.pages_langues[code] || []).map(async p => ({ ref: p, url: await d.url(p) })));
                }
                return {
                    numero: c.numero, titre: c.titre, statut: c.statut, pagesLangues, texte: c.texte || "",
                    pages: await Promise.all((c.pages || []).map(async p => ({ ref: p, url: await d.url(p) })))
                };
            }));
        },
        saveManga: m => driver().saveManga(m),
        deleteManga: id => driver().deleteManga(id),
        async saveChapter(c) {
            const d = driver();
            // Un manga de départ est enregistré en base au premier chapitre créé
            const rows = await d.rawMangas();
            const s = STATIC.find(x => x.id === c.manga_id);
            if (s && !rows.some(m => m.id === s.id)) await d.saveManga({ id: s.id, titre: s.titre, genres: s.genres, sens: s.sens });
            return d.saveChapter(c);
        },
        deleteChapter: (id, n) => driver().deleteChapter(id, n),
        // Illustrations (toutes, brouillons compris : réservé à l'équipe)
        async illustrations() {
            const d = driver();
            const rows = await d.rawIllustrations();
            return Promise.all(rows.map(async r => ({
                id: r.id, titre: r.titre, description: r.description || "", manga_id: r.manga_id || null, statut: r.statut,
                auteur: r.auteur, cree_par: r.cree_par || null, created_at: r.created_at,
                image: { ref: r.image, url: await d.url(r.image) }
            })));
        },
        async publications() {
            const d = driver();
            const rows = await d.rawPublications();
            return Promise.all(rows.map(async r => Object.assign({}, r, { image: r.image ? { ref: r.image, url: await d.url(r.image) } : null })));
        },
        savePublication: p => driver().savePublication(p),
        deletePublication: id => driver().deletePublication(id),
        saveIllustration: i => driver().saveIllustration(i),
        deleteIllustration: id => driver().deleteIllustration(id),
        upload: (id, blob, ext) => driver().upload(id, blob, ext),
        removeFiles: refs => driver().removeFiles(refs),
        urlOf: ref => driver().url(ref)
    };

    // Illustrations publiées, pour la galerie (visible par tous)
    async function illustrations() {
        await Mbokal.ready;
        const d = driver();
        if (!d) return [];
        const rows = (await d.rawIllustrations()).filter(r => r.statut === "publie");
        rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        return Promise.all(rows.map(async r => ({
            id: r.id, titre: r.titre, description: r.description || "", manga_id: r.manga_id || null,
            auteur: r.auteur, created_at: r.created_at, url: await d.url(r.image)
        })));
    }

    // Publications publiées : actualités, annonces, événements, personnages, bannières
    async function publications(opts) {
        opts = opts || {};
        await Mbokal.ready;
        const d = driver();
        if (!d) return [];
        const rows = (await d.rawPublications())
            .filter(r => (opts.drafts || r.statut === "publie")
                && (!opts.types || opts.types.indexOf(r.type) !== -1)
                && (!opts.manga || r.manga_id === opts.manga));
        return Promise.all(rows.map(async r => Object.assign({}, r, { url: r.image ? await d.url(r.image) : null })));
    }

    // Les mangas écrits « en dur » dans les pages (accueil, découvrir, studio) prennent la couverture
    // envoyée depuis l'atelier : l'identifiant vient du lien « fiche » de la carte.
    function applyCovers() {
        document.querySelectorAll(".manga-card").forEach(card => {
            if (card.dataset.dynamic) return;
            const a = card.querySelector('a.cover-link[href*="id="]');
            const cover = card.querySelector(".cover");
            if (!a || !cover) return;
            const id = new URL(a.href, location.href).searchParams.get("id");
            const m = window.MANGAS.find(x => x.id === id);
            if (!m || !m.couverture) return;
            cover.style.backgroundImage = "url(\"" + m.couverture.replace(/"/g, "%22") + "\")";
            cover.style.backgroundSize = "cover";
            cover.style.backgroundPosition = "center";
            cover.classList.add("has-image");
        });
    }

    const Catalog = { ready: null, load, renderCards, applyCovers, illustrations, publications, admin, staticIds: STATIC_IDS };
    window.Catalog = Catalog;

    // Chargement automatique, puis cartes dynamiques sur les pages qui les prévoient
    Catalog.ready = load().then(() => {
        const fill = () => { document.querySelectorAll("[data-catalog]").forEach(renderCards); applyCovers(); };
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fill);
        else fill();
    });
})();
