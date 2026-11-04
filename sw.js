/* =====================================================
   SERVICE WORKER — l'application Manga Mbokal
   - Pages, styles et scripts : toujours le réseau d'abord (le site reste
     à jour), la copie gardée sert quand il n'y a pas de connexion.
   - Images des chapitres (stockage Supabase) : gardées pour relire hors
     connexion ce qui a déjà été ouvert (200 images au maximum).
   - Polices, icônes et bibliothèques versionnées : gardées.
   - Comptes, base de données, commentaires : JAMAIS gardés.
   La version est calculée automatiquement à chaque mise à jour du site.
===================================================== */
const VERSION = "5a09dd312c";
const CORE = "mbokal-core-" + VERSION;
const MEDIA = "mbokal-media";
const LIB = "mbokal-lib";
const MAX_MEDIA = 200;
const SHELL = [
 "./",
 "actualites.html",
 "admin.html",
 "admin.js",
 "app.js",
 "apple-touch-icon.png",
 "atelier.css",
 "atelier.html",
 "atelier.js",
 "catalogue.js",
 "classement.css",
 "commentaires.js",
 "compte.html",
 "compte.js",
 "config.js",
 "decouvrir.html",
 "emblem.png",
 "evenements.html",
 "favicon-32.png",
 "favicon.ico",
 "galerie.html",
 "galerie.js",
 "hors-ligne.html",
 "icon-192.png",
 "icon-512.png",
 "icon-maskable-512.png",
 "index.html",
 "langue.css",
 "langue.js",
 "lecteur.css",
 "lecteur.html",
 "lecteur.js",
 "logo-jaune.png",
 "logo.png",
 "manga.html",
 "manga.js",
 "mangas.js",
 "manifest.webmanifest",
 "mbokal.css",
 "mbokal.js",
 "menu.html",
 "og-image.png",
 "personnages.html",
 "publication.html",
 "publications.js",
 "recherche.html",
 "studio.html",
 "style.css",
 "telechargement.html",
 "texte.js",
 "top.html",
 "top.js",
 "traductions.js"
];

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CORE);
        // un fichier introuvable ne doit pas empêcher l'installation des autres
        await Promise.all(SHELL.map(url => cache.add(new Request(url, { cache: "reload" })).catch(() => {})));
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        for (const key of await caches.keys()) {
            if (key.indexOf("mbokal-core-") === 0 && key !== CORE) await caches.delete(key);
        }
        await self.clients.claim();
    })());
});

// Requête avec CORS : la réponse garde sa vraie taille (une réponse « opaque » compterait ~7 Mo)
async function corsFetch(req) {
    try { return await fetch(new Request(req.url, { mode: "cors", credentials: "omit" })); }
    catch (e) { return fetch(req); }
}

async function sameOrigin(req) {
    const cache = await caches.open(CORE);
    try {
        const res = await fetch(req);
        if (res && res.ok && res.status === 200) cache.put(req, res.clone());
        return res;
    } catch (err) {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === "navigate") {
            const offline = await cache.match("hors-ligne.html");
            if (offline) return offline;
        }
        return Response.error();
    }
}

async function trim(cache) {
    const keys = await cache.keys();
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_MEDIA))) await cache.delete(k);
}

async function media(req) {
    const cache = await caches.open(MEDIA);
    const hit = await cache.match(req.url);
    if (hit) return hit;
    const res = await corsFetch(req);
    if (res && res.ok) { cache.put(req.url, res.clone()).then(() => trim(cache)); }
    return res;
}

async function lib(req) {
    const cache = await caches.open(LIB);
    const hit = await cache.match(req.url);
    if (hit) return hit;
    const res = await corsFetch(req);
    if (res && res.ok) cache.put(req.url, res.clone());
    return res;
}

self.addEventListener("fetch", event => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin === self.location.origin) {
        if (url.pathname.endsWith("/sw.js")) return;          // le service worker se met à jour tout seul
        event.respondWith(sameOrigin(req));
    } else if (url.pathname.indexOf("/storage/v1/object/public/") !== -1) {
        event.respondWith(media(req));
    } else if (/(^|\.)cdnjs\.cloudflare\.com$|(^|\.)cdn\.jsdelivr\.net$/.test(url.hostname)) {
        event.respondWith(lib(req));
    }
    // tout le reste (comptes, base de données) : réseau seulement, rien n'est gardé
});
