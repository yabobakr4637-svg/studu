// api/gemini.js
// Vercel Serverless Function to proxy requests to Gemini (Generative Language).
// Place this file at the repo root under /api/gemini.js and deploy to Vercel.
// Set GEMINI_API_KEY in Vercel Environment Variables.
// Optional: set ALLOWED_ORIGIN to restrict CORS (e.g. https://your-netlify-site.netlify.app).

export default async function handler(req, res) {
  // CORS preflight support
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = req.body || (await (async () => {
    // Vercel sometimes passes raw body; try to parse
    try { return JSON.parse(req.rawBody || "{}"); } catch { return {}; }
  })());

  const prompt = body.prompt;
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ ok: false, error: "prompt is required and must be a string" });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ ok: false, error: "GEMINI_API_KEY not configured on server" });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;

  // small fetch with timeout
  const fetchWithTimeout = async (url, opts = {}, timeoutMs = 20000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(id);
      return resp;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  };

  try {
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, 20000);

    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      console.error("Gemini upstream error:", response.status, txt);
      return res.status(502).json({ ok: false, error: "Upstream API error", status: response.status, raw: txt });
    }

    const data = await response.json();
    const result = data?.candidates?.[0]?.content?.parts?.[0]?.text || data?.output?.[0]?.content?.text || "";

    return res.status(200).json({ ok: true, result, raw: data });
  } catch (err) {
    console.error("Proxy error:", err && (err.stack || err.message || err));
    if (err.name === "AbortError") {
      return res.status(504).json({ ok: false, error: "Upstream request timed out" });
    }
    return res.status(500).json({ ok: false, error: "Server error calling Gemini", details: err.message || String(err) });
  }
}
