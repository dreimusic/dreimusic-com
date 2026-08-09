/**
 * Free-guides lead magnet signup.
 *
 * Adds the submitted email to Kit as an active subscriber and tags them
 * "All Subs" - this is the same tag every existing subscriber already has
 * from downloading this exact freebie in the past, so new signups stay
 * consistent with the rest of the audience.
 *
 * KIT_API_KEY must be set as a Vercel environment variable (already is,
 * from the Dodo -> Kit webhook setup).
 */

const ALL_SUBS_TAG_ID = "22250647"; // Kit tag: "All Subs"

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

    const tagRes = await fetch(`https://api.kit.com/v4/tags/${ALL_SUBS_TAG_ID}/subscribers/${subscriberId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Kit-Api-Key": process.env.KIT_API_KEY,
      },
      body: "{}",
    });
    if (!tagRes.ok) throw new Error(`Kit tagging failed: ${tagRes.status} ${await tagRes.text()}`);

    res.status(200).json({ ok: true, downloadUrl: "/assets/downloads/harmony-blueprint-10-free-guides.zip" });
  } catch (err) {
    console.error("free-guides-signup error:", err);
    res.status(500).json({ error: "Something went wrong on our end. Try again in a moment." });
  }
};
