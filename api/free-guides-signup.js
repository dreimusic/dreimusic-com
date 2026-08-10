/**
 * Free-guides lead magnet signup.
 *
 * Adds the submitted email to Kit and attaches it to the "Free Guides
 * Signup" form (id 9783669), which has double opt-in enabled - Kit sends
 * its own confirmation email, and only delivers the download (configured
 * as that form's post-confirmation redirect, in the Kit dashboard) once
 * the person actually clicks it. This keeps junk/fake emails from getting
 * an instant download and from polluting the audience.
 *
 * Also tags them "All Subs" right away - that's just internal organization
 * and doesn't grant any sending permission on its own; Kit's own
 * confirmation state is what actually gates real marketing sends.
 *
 * KIT_API_KEY must be set as a Vercel environment variable (already is,
 * from the Dodo -> Kit webhook setup).
 */

const ALL_SUBS_TAG_ID = "22250647"; // Kit tag: "All Subs"
const FREE_GUIDES_FORM_ID = "9783669"; // Kit form: double opt-in + incentive redirect to the download

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    res.status(400).json({ error: "invalid json" });
    return;
  }

  const email = (body.email || "").trim().toLowerCase();

  // honeypot - a real user never fills this hidden field, only bots do
  if (body.company) {
    res.status(200).json({ ok: true });
    return;
  }

  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  try {
    const subRes = await fetch("https://api.kit.com/v4/subscribers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Kit-Api-Key": process.env.KIT_API_KEY,
      },
      body: JSON.stringify({ email_address: email, state: "active" }),
    });
    if (!subRes.ok) throw new Error(`Kit subscriber upsert failed: ${subRes.status} ${await subRes.text()}`);
    const subData = await subRes.json();
    const subscriberId = subData.subscriber && subData.subscriber.id;
    if (!subscriberId) throw new Error("Kit response missing subscriber id");

    const formRes = await fetch(`https://api.kit.com/v4/forms/${FREE_GUIDES_FORM_ID}/subscribers/${subscriberId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Kit-Api-Key": process.env.KIT_API_KEY,
      },
      body: "{}",
    });
    if (!formRes.ok) throw new Error(`Kit form subscribe failed: ${formRes.status} ${await formRes.text()}`);

    const tagRes = await fetch(`https://api.kit.com/v4/tags/${ALL_SUBS_TAG_ID}/subscribers/${subscriberId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Kit-Api-Key": process.env.KIT_API_KEY,
      },
      body: "{}",
    });
    if (!tagRes.ok) throw new Error(`Kit tagging failed: ${tagRes.status} ${await tagRes.text()}`);

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("free-guides-signup error:", err);
    res.status(500).json({ error: "Something went wrong on our end. Try again in a moment." });
  }
};
