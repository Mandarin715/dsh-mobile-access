// DSH Basic-Auth proxy that ALSO tunnels WebSocket (for real-time updates).
// frp's https2http plugin terminates TLS and forwards plain HTTP here. So this
// server is http. It checks Basic Auth, then proxies normal requests AND
// WebSocket upgrades to DSH :3080.
//
// == HOW TO USE ==
// Set these env vars (or edit the fallbacks):
//   AUTH_USER  - username for the shared login
//   AUTH_PASS  - password for the shared login
//   PROXY_PORT - local port this proxy listens on (default 18443)
//   TARGET_PORT- DSH HTTP port (default 3080)
//
// This is from the dsh-mobile-access project. Replace the inline fallback
// credentials with your own, or (recommended) pass them via environment
// variables. Never commit real credentials.
const http = require('http');
const net = require('net');

const PORT = process.env.PROXY_PORT ? Number(process.env.PROXY_PORT) : 18443;
const TARGET_HOST = '127.0.0.1';
const TARGET_PORT = process.env.TARGET_PORT ? Number(process.env.TARGET_PORT) : 3080;

// Read credentials from env; fall back to placeholders that YOU must replace.
// Never ship real passwords. Use a `.env` file (not committed) for real values.
const USER = process.env.AUTH_USER || 'YOUR_USERNAME';
const PASS = process.env.AUTH_PASS || 'YOUR_PASSWORD';
const EXPECTED = 'Basic ' + Buffer.from(USER + ':' + PASS).toString('base64');

function isAuthorized(req) {
  const auth = req.headers['authorization'] || req.headers['proxy-authorization'];
  return auth === EXPECTED;
}
function unauthorized(res) {
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="dsh-remote", charset="UTF-8"',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end('401 Unauthorized');
}

const server = http.createServer((req, res) => {
  if (!isAuthorized(req)) return unauthorized(res);
  const opts = {
    hostname: TARGET_HOST, port: TARGET_PORT, path: req.url, method: req.method,
    headers: Object.assign({}, req.headers),
  };
  delete opts.headers['proxy-authorization'];
  delete opts.headers['connection'];
  delete opts.headers['upgrade']; // not an upgrade here
  const proxyReq = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => { res.writeHead(502); res.end('502: ' + err.message); });
  req.pipe(proxyReq);
});

// WebSocket / upgrade tunneling (needed for DSH real-time updates)
server.on('upgrade', (req, socket, head) => {
  if (!isAuthorized(req)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
  const upstream = net.connect(TARGET_PORT, TARGET_HOST, () => {
    let reqStr = req.method + ' ' + req.url + ' HTTP/1.1\r\n';
    const keys = Object.keys(req.headers).filter(k => k.toLowerCase() !== 'proxy-authorization');
    for (const k of keys) reqStr += k + ': ' + req.headers[k] + '\r\n';
    reqStr += '\r\n';
    upstream.write(reqStr);
    if (head && head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket); // bidirectional
  });
  upstream.on('error', () => { socket.destroy(); });
  socket.on('error', () => { upstream.destroy(); });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('auth-proxy with WS tunnel listening on 127.0.0.1:' + PORT);
  console.log('  (set AUTH_USER / AUTH_PASS via env, do not commit real creds)');
});
