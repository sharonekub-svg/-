import { handleOptions } from '../_shared/cors.ts';
import { errorJson, json, readJson } from '../_shared/json.ts';
import { authedUserId, httpError } from '../_shared/supabaseAdmin.ts';

type Body = {
  url?: string;
};

const MAX_HTML_CHARS = 900_000;

function assertPublicHttpsUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw httpError(400, 'invalid_url');
  }

  if (parsed.protocol !== 'https:') throw httpError(400, 'https_required');

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    throw httpError(400, 'private_hosts_not_allowed');
  }

  return parsed;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    await authedUserId(req);
    const body = await readJson<Body>(req);
    const url = assertPublicHttpsUrl((body.url ?? '').trim());

    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 ShakanaProductFinder/1.0',
      },
    });

    if (!res.ok) {
      throw httpError(502, 'product_fetch_failed', `Store returned ${res.status}`);
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType && !contentType.toLowerCase().includes('text/html')) {
      throw httpError(415, 'unsupported_product_content');
    }

    const html = (await res.text()).slice(0, MAX_HTML_CHARS);
    return json({ html });
  } catch (err) {
    return errorJson(err);
  }
});
