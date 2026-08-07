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
 * target ever changes. This is the LIVE-mode link - real charges happen here.
 */
const CONFIG = {
  CHECKOUT_URL: "https://dodo.pe/get-harmony-blueprint",
  APP_URL: "https://harmonyblueprint.dreimusic.com",
};

document.getElementById("year").textContent = new Date().getFullYear();

// ---------- checkout overlay ----------

function openCheckout() {
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
