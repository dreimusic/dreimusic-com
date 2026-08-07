/**
 * Dodo Payments webhook -> Kit (ConvertKit) subscriber sync.
 *
 * Register this endpoint's URL (https://dreimusic.com/api/dodo-webhook) in
 * the Dodo dashboard under Developer > Webhooks, subscribed to the
 * "payment.succeeded" event. Dodo gives you a signing secret at that point -
 * set it as DODO_WEBHOOK_SECRET in Vercel's project environment variables
 * (Settings > Environment Variables), never committed to this repo.
 *
 * The webhook payload itself is only trusted as a "something happened,
 * go look" trigger - once verified, this re-fetches the actual payment
 * record from Dodo's API for ground truth before doing anything, the same
 * defensive pattern used everywhere else in this project.
 *
 * Only tags people as "Harmony Blueprint buyers" right now, since that's
 * the only live product. If a second product (e.g. Melody Blueprint) goes
 * live later, this needs a product check added so it tags the right
 * audience per product rather than tagging every sale as a Harmony
 * Blueprint buyer.
 */

const HARMONY_BUYERS_TAG_ID = "22251038"; // Kit tag: "Harmony Blueprint Buyers"

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function verifySignature(rawBody, headers, secret) {
  const webhookId = headers["webhook-id"];
  const webhookTimestamp = headers["webhook-timestamp"];
  const webhookSignature = headers["webhook-signature"];
  if (!webhookId || !webhookTimestamp || !webhookSignature || !secret) return false;

  // reject anything older than 5 minutes (basic replay protection, per the
  // Standard Webhooks spec's own recommendation)
  const age = Math.abs(Date.now() / 1000 - Number(webhookTimestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const crypto = require("crypto");
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  const provided = webhookSignature
    .split(" ")
    .map((s) => s.split(",")[1])
    .filter(Boolean);

  return provided.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, "base64"), Buffer.from(expected, "base64"));
    } catch {
      return false;
    }
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const rawBody = await readRawBody(req);

  if (!verifySignature(rawBody, req.headers, process.env.DODO_WEBHOOK_SECRET)) {
    res.status(401).json({ error: "invalid signature" });
    return;
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    res.status(400).json({ error: "invalid json" });
    return;
  }

  if (event.type !== "payment.succeeded") {
    res.status(200).json({ ok: true, skipped: event.type });
    return;
  }

  const paymentId = event.data && event.data.payment_id;
  if (!paymentId) {
    res.status(200).json({ ok: true, skipped: "no payment_id in event" });
    return;
  }

  try {
    const paymentRes = await fetch(`https://live.dodopayments.com/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.DODO_LIVE_API_KEY}` },
    });
    if (!paymentRes.ok) throw new Error(`Dodo payment lookup failed: ${paymentRes.status}`);
    const payment = await paymentRes.json();

    if (payment.status !== "succeeded") {
      res.status(200).json({ ok: true, skipped: `payment status is ${payment.status}` });
      return;
    }

    const email = payment.customer && payment.customer.email;
    const name = payment.customer && payment.customer.name;
    if (!email) throw new Error("payment record has no customer email");

    const subRes = await fetch("https://api.kit.com/v4/subscribers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Kit-Api-Key": process.env.KIT_API_KEY,
      },
      body: JSON.stringify({
        email_address: email,
        ...(name ? { first_name: name } : {}),
        state: "active",
      }),
    });
    if (!subRes.ok) throw new Error(`Kit subscriber upsert failed: ${subRes.status} ${await subRes.text()}`);
    const subData = await subRes.json();
    const subscriberId = subData.subscriber && subData.subscriber.id;
    if (!subscriberId) throw new Error("Kit response missing subscriber id");

    const tagRes = await fetch(`https://api.kit.com/v4/tags/${HARMONY_BUYERS_TAG_ID}/subscribers/${subscriberId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Kit-Api-Key": process.env.KIT_API_KEY,
      },
      body: "{}",
    });
    if (!tagRes.ok) throw new Error(`Kit tagging failed: ${tagRes.status} ${await tagRes.text()}`);

    res.status(200).json({ ok: true, email, subscriberId });
  } catch (err) {
    console.error("dodo-webhook error:", err);
    // 500 so Dodo retries this event later instead of silently dropping it
    res.status(500).json({ ok: false, error: String(err) });
  }
};

module.exports.config = { api: { bodyParser: false } };
