// Serverless proxy for Vercel: /api/appointment?id=<id>&api=<backendBase>
export default async function handler(req, res) {
  try {
    const { id, api } = req.query || {};
    if (!id) return res.status(400).json({ error: 'missing_id' });
    if (!api) return res.status(400).json({ error: 'missing_api_base' });

    const base = String(api).replace(/\/$/, '');
    const url = `${base}/api/appointment/${encodeURIComponent(String(id))}`;

    const r = await fetch(url, { headers: { 'accept': 'application/json' }, cache: 'no-store' });
    if (!r.ok) {
      return res.status(r.status).json({ error: 'upstream_error', status: r.status });
    }
    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'proxy_failed', message: e.message });
  }
}






