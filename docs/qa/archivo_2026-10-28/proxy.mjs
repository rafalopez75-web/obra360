// Banco local: sirve el index.html de la rama apuntando a este servidor y reenvía /rest/v1 a PostgREST.
// /auth/v1 es un stub mínimo (login con contraseña "prueba" para los usuarios ficticios del seed).
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
const [,, PORT, PGRST, APPDIR] = process.argv;
const SECRET = fs.readFileSync(new URL('./jwt_secret', import.meta.url), 'utf8').trim();
const USERS = { 'kam@prueba.test': '00000000-0000-0000-0000-00000000000a', 'uno@prueba.test': '00000000-0000-0000-0000-00000000000b', 'dos@prueba.test': '00000000-0000-0000-0000-00000000000c' };
const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const jwt = (sub, email) => { const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ sub, email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 });
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`; };
const userOf = (id, email) => ({ id, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const body = await new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const html = fs.readFileSync(APPDIR + '/index.html', 'utf8').replace("'https://bigbxebupzryrdnovnum.supabase.co'", `'http://127.0.0.1:${PORT}'`);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(html);
  }
  if (url.pathname === '/sw.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(fs.readFileSync(APPDIR + '/sw.js')); }
  if (url.pathname === '/auth/v1/token') {
    const { email, password } = JSON.parse(body || '{}');
    if (!USERS[email] || password !== 'prueba') return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
    const now = Math.floor(Date.now() / 1000);
    return json(res, 200, { access_token: jwt(USERS[email], email), token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r-' + USERS[email], user: userOf(USERS[email], email) });
  }
  if (url.pathname === '/auth/v1/user') {
    const t = (req.headers.authorization || '').replace('Bearer ', '');
    try { const p = JSON.parse(Buffer.from(t.split('.')[1], 'base64url')); if (p.sub) return json(res, 200, userOf(p.sub, p.email)); } catch {}
    return json(res, 401, { msg: 'no session' });
  }
  if (url.pathname === '/auth/v1/logout') { res.writeHead(204); return res.end(); }
  if (url.pathname.startsWith('/functions/v1/') || url.pathname.startsWith('/storage/v1/')) return json(res, 404, { msg: 'no disponible en el banco local' });
  if (url.pathname.startsWith('/rest/v1/')) {
    const headers = { ...req.headers }; delete headers.host; delete headers['content-length'];
    const r = await fetch(PGRST + url.pathname.slice('/rest/v1'.length) + url.search, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
    const out = Buffer.from(await r.arrayBuffer());
    const h = {}; r.headers.forEach((v, k) => { if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(k)) h[k] = v; });
    res.writeHead(r.status, h); return res.end(out);
  }
  json(res, 404, { msg: 'no encontrado' });
}).listen(Number(PORT), '127.0.0.1', () => console.log('banco en', PORT, '->', PGRST));
