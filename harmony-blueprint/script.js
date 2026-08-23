/**
 * If Dodo redirects back after a successful payment while this page is
 * still sitting inside our own checkout overlay iframe, escape to the top
 * window immediately so the thank-you screen shows on the real page instead
 * of nested inside the small iframe. Must run before anything else.
 */
if (window.self !== window.top) {
  window.top.location.href = window.location.href;
}

/**
 * Config.
 * CHECKOUT_URL is a Dodo "Short Link" (created once via their API, not the
 * plain product share link) with redirect_url baked in via
 * static_checkout_params, since Dodo ignores query params appended at
 * click-time on a short link. Recreate it (and update this) if the redirect
 * target ever changes - it's currently pinned to
 * https://dreimusic.com/harmony-blueprint/, so moving this page again means
 * recreating the short link too. This is the LIVE-mode link - real charges
 * happen here.
 */
const CONFIG = {
  SALES_LIVE: true,
  CHECKOUT_URL: "https://dodo.pe/buy-harmony-blueprint-v2",
  APP_URL: "https://harmonyblueprint.dreimusic.com",
  // Mac build is fully notarized and stapled as of 2026-08-22 - no
  // Gatekeeper warning for anyone installing this file.
  PLUGIN_DOWNLOADS: {
    macReady: true,
    macUrl: "/assets/downloads/harmony-blueprint-installer-mac.pkg",
    winReady: true,
    winUrl: "/assets/downloads/harmony-blueprint-installer-win.exe",
  },
};

document.getElementById("year").textContent = new Date().getFullYear();

// ---------- checkout overlay ----------

function flashComingSoon(btn) {
  if (btn.dataset.flashing) return; // already mid-flash, don't stack timers
  btn.dataset.flashing = "1";
  const original = btn.innerHTML;
  btn.textContent = "Launching very soon — check back!";
  setTimeout(() => {
    btn.innerHTML = original;
    delete btn.dataset.flashing;
  }, 2500);
}

function openCheckout(e) {
  if (!CONFIG.SALES_LIVE) {
    flashComingSoon(e.currentTarget);
    return;
  }
  const overlay = document.getElementById("checkoutOverlay");
  const wrap = document.getElementById("coFrameWrap");
  wrap.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.src = CONFIG.CHECKOUT_URL;
  iframe.title = "Checkout";
  // grants the Payment Request API to this iframe - without it, Google
  // Pay/Apple Pay can't render inline and fall back to a popup, which
  // browsers block by default coming from a nested iframe
  iframe.allow = "payment";
  wrap.appendChild(iframe);
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeCheckout() {
  const overlay = document.getElementById("checkoutOverlay");
  overlay.hidden = true;
  document.body.style.overflow = "";
  document.getElementById("coFrameWrap").innerHTML = "";
}

document.querySelectorAll(".js-buy-btn").forEach((btn) => {
  btn.addEventListener("click", openCheckout);
});
document.getElementById("coCloseBtn").addEventListener("click", closeCheckout);
document.getElementById("checkoutOverlay").addEventListener("click", (e) => {
  if (e.target.id === "checkoutOverlay") closeCheckout();
});

// ---------- thank-you confirmation ----------
// After a successful purchase, Dodo redirects back here with
// ?status=succeeded&payment_id=...&license_key=...&email=... appended.

function showThankYou({ licenseKey }) {
  const overlay = document.getElementById("thankYouOverlay");
  const keyEl = document.getElementById("tyLicenseKey");
  const appLink = document.getElementById("tyAppLink");

  keyEl.textContent = licenseKey || "Check your email for your license key";
  appLink.href = CONFIG.APP_URL;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";

  const { macReady, macUrl, winReady, winUrl } = CONFIG.PLUGIN_DOWNLOADS;
  const macBtn = document.getElementById("tyMacDownload");
  const winBtn = document.getElementById("tyWinDownload");
  const note = document.getElementById("tyDownloadsNote");

  if (macReady) {
    macBtn.href = macUrl;
    macBtn.hidden = false;
  }
  if (winReady) {
    winBtn.href = winUrl;
    winBtn.hidden = false;
  }
  note.hidden = macReady && winReady;

  document.getElementById("tyCopyBtn").addEventListener("click", () => {
    if (!licenseKey) return;
    navigator.clipboard.writeText(licenseKey);
  });

  function close() {
    overlay.hidden = true;
    document.body.style.overflow = "";
  }
  document.getElementById("tyCloseBtn").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
}

(function checkForPurchaseConfirmation() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status");
  if (status !== "succeeded") return;

  showThankYou({ licenseKey: params.get("license_key") });

  // strip the query string (license key shouldn't linger in the address bar
  // or be re-shown on a plain refresh) while keeping the rest of the URL
  const cleanUrl = window.location.origin + window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);
})();
