// api/gemini.js
export const config = { api: { bodyParser: true } }; // مهم جدًا لتفادي undefined body

export default async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const body = req.body;
  const prompt = body?.prompt;
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ ok: false, error: "prompt is required and must be a string" });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ ok: false, error: "GEMINI_API_KEY not configured" });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      return res.status(502).json({ ok: false, error: "Upstream API error", status: response.status, raw: txt });
    }

    let data;
    try { data = await response.json(); } catch { data = {}; }

    const result = data?.candidates?.[0]?.content?.parts?.[0]?.text || data?.output?.[0]?.content?.text || "";

    return res.status(200).json({ ok: true, result, raw: data });
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ ok: false, error: "Server error calling Gemini", details: err.message || String(err) });
  }
}
