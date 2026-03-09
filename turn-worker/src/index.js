/**
 * Cloudflare Worker — vends ephemeral TURN credentials for Scratchpad P2P.
 *
 * Environment secrets (set via `wrangler secret put`):
 *   TURN_KEY_ID        — Cloudflare Calls TURN key ID
 *   TURN_KEY_API_TOKEN — Cloudflare Calls TURN API token
 *
 * Optional env vars (set in wrangler.toml [vars] or secrets):
 *   ALLOWED_ORIGINS    — comma-separated origins, defaults to "*"
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function corsHeaders(origin, env) {
  const allowed = env.ALLOWED_ORIGINS || '*';
  return {
    ...CORS_HEADERS,
    'Access-Control-Allow-Origin': allowed === '*' ? '*' : (allowed.split(',').map(s => s.trim()).includes(origin) ? origin : ''),
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/turn-credentials') {
      return new Response('Not found', { status: 404, headers });
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers });
    }

    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.TURN_KEY_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: 86400 }),
        }
      );

      if (!res.ok) {
        return new Response('Failed to generate credentials', { status: 502, headers });
      }

      const data = await res.json();
      return Response.json(data.iceServers, {
        headers: { ...headers, 'Cache-Control': 'public, max-age=3600' },
      });
    } catch {
      return new Response('Internal error', { status: 500, headers });
    }
  },
};
