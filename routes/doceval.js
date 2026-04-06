const express = require('express');
const router  = express.Router();
const https   = require('https');

const UPSTREAM_HOST = 'doceval-8362469192e8.herokuapp.com';

// Proxy all DocEval API calls server-side to avoid CORS issues.
// Mounted at /api/doceval-proxy — req.url will be the path after the mount point.
router.all('*', (req, res) => {
  const upstreamHeaders = { ...req.headers, host: UPSTREAM_HOST };
  // Remove hop-by-hop headers that must not be forwarded
  delete upstreamHeaders['connection'];
  delete upstreamHeaders['transfer-encoding']; // prevent chunked vs Content-Length conflict

  function sendToUpstream(body) {
    // Set Content-Length from the actual buffered body so Heroku always gets a clean request
    if (body && body.length > 0) {
      upstreamHeaders['content-length'] = body.length;
    }

    const proxy = https.request({
      hostname: UPSTREAM_HOST,
      path:     req.url,
      method:   req.method,
      headers:  upstreamHeaders
    }, proxyRes => {
      res.status(proxyRes.statusCode);
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (k.toLowerCase() !== 'transfer-encoding') res.setHeader(k, v);
      }
      proxyRes.pipe(res);
    });

    proxy.on('error', err => {
      if (!res.headersSent) res.status(502).json({ error: 'Upstream unavailable', message: err.message });
    });

    proxy.end(body || Buffer.alloc(0));
  }

  if (req.is('application/json') && req.body) {
    // express.json() already parsed this — re-serialize for the upstream
    const body = Buffer.from(JSON.stringify(req.body));
    upstreamHeaders['content-type'] = 'application/json';
    sendToUpstream(body);
  } else {
    // multipart/form-data and GET requests — buffer the raw stream fully before forwarding.
    // Piping directly (req.pipe) causes Transfer-Encoding/Content-Length conflicts with Heroku.
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end',  ()    => sendToUpstream(Buffer.concat(chunks)));
    req.on('error', err  => {
      if (!res.headersSent) res.status(502).json({ error: 'Request read error', message: err.message });
    });
  }
});

module.exports = router;
