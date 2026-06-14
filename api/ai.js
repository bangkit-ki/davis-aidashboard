// api/ai.js — Vercel Serverless Function
// Proxy untuk IYH App API agar API key aman dan tidak ada CORS issue

export default async function handler(req, res) {
  // Hanya izinkan POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Ambil API key dari environment variable Vercel
  const apiKey = process.env.IYH_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'IYH_API_KEY not configured in environment variables' });
  }

  try {
    const { model, messages, temperature } = req.body;

    const response = await fetch('https://v1.iyhapi.app/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'gemini-3-flash',
        messages: messages || [],
        temperature: temperature ?? 0.3
      })
    });

    // Forward error dari IYH API
    if (!response.ok) {
      let errBody;
      try {
        errBody = await response.json();
      } catch {
        errBody = await response.text();
      }
      return res.status(response.status).json({
        error: errBody?.error?.message || errBody || `IYH API error: ${response.status}`
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
