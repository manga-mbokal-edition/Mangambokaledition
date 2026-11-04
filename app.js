/* =====================================================
   APPLICATION : installation sur l'écran d'accueil
   - enregistre le service worker (sw.js)
   - propose l'installation (Android : bouton natif ; iPhone : explication)
   - prévient quand la connexion est perdue
   Tout le texte passe par textContent.
===================================================== */
(function () {
    "use strict";

    const KEY = "mbokal:app-dismissed";
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    const reading = /lecteur\.html/.test(location.pathname);
    let deferred = null;
    let banner = null;

    const el = (tag, cls, text) => {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    };
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage bloqué */ } }
    };

    function toast(text) {
        document.querySelectorAll(".app-toast").forEach(n => n.remove());
        const t = el("div", "app-toast", text);
        t.setAttribute("role", "status");
        document.body.append(t);
        setTimeout(() => t.remove(), 5000);
    }

    /* ---------- Service worker ---------- */
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("sw.js").catch(() => { /* pas de page hors connexion, le site marche quand même */ });
        });
    }

    /* ---------- Bannière d'installation ---------- */
    const recentlyDismissed = () => Date.now() - Number(store.get(KEY) || 0) < 14 * 86400000;
    const closeBanner = () => { if (banner) { banner.remove(); banner = null; } };

    function showBanner(text, withButton) {
        if (banner || standalone || reading || recentlyDismissed()) return;
        banner = el("div", "app-banner");
        banner.setAttribute("role", "region");
        banner.append(el("span", "app-banner-text", text));
        if (withButton) {
            const go = el("button", "app-banner-go", "Installer");
            go.type = "button";
            go.addEventListener("click", install);
            banner.append(go);
        }
        const x = el("button", "app-banner-x", "✕");
        x.type = "button";
        x.setAttribute("aria-label", "Fermer");
        x.addEventListener("click", () => { store.set(KEY, String(Date.now())); closeBanner(); });
        banner.append(x);
        document.body.append(banner);
    }

    async function install() {
        if (deferred) {
            deferred.prompt();
            try { await deferred.userChoice; } catch (e) { /* ignoré */ }
            deferred = null;
            closeBanner();
            return;
        }
        help();
    }

    function helpText() {
        return ios
            ? "Pour installer : touche Partager, puis « Sur l'écran d'accueil »."
            : "Pour installer : ouvre le menu du navigateur (⋮), puis « Installer l'application » ou « Ajouter à l'écran d'accueil ».";
    }
    function help() {
        document.querySelectorAll("[data-install-help]").forEach(n => { n.textContent = helpText(); n.hidden = false; });
    }

    /* ---------- Bouton d'installation du menu ---------- */
    function wireMenu() {
        document.querySelectorAll("[data-install]").forEach(b => {
            if (standalone) {
                const label = b.querySelector("strong");
                if (label) label.textContent = "Application installée";
                const small = b.querySelector("small");
                if (small) small.textContent = "";
                b.removeAttribute("href");
                return;
            }
            b.addEventListener("click", e => { e.preventDefault(); install(); });
        });
    }

    window.addEventListener("beforeinstallprompt", e => {
        e.preventDefault();
        deferred = e;
        showBanner("Installer l'application Manga Mbokal", true);
    });

    window.addEventListener("appinstalled", () => { deferred = null; closeBanner(); toast("Application installée"); });

    window.addEventListener("offline", () => toast("Tu es hors connexion : seuls les contenus déjà ouverts sont disponibles."));
    window.addEventListener("online", () => toast("Connexion rétablie."));

    function start() {
        wireMenu();
        if (ios && !standalone) showBanner(helpText(), false);        // iPhone : pas de bouton natif
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
