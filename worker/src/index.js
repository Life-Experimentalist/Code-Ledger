// Cloudflare Worker using Hono
import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';

const app = new Hono();

// Auth Endpoints
app.get('/auth/github', (c) => {
  const clientId = c.env.GITHUB_CLIENT_ID;
  const redirect = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo`;
  return c.redirect(redirect);
});

app.get('/auth/github/callback', async (c) => {
  const code = c.req.query('code');
  const clientId = c.env.GITHUB_CLIENT_ID;
  const clientSecret = c.env.GITHUB_CLIENT_SECRET;

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
  });
  
  const data = await res.json();
  
  return c.html(`
    <!DOCTYPE html>
    <html><body>
      <script>
        window.opener.postMessage({ type: 'GITHUB_TOKEN', token: '${data.access_token || ''}' }, '*');
        window.close();
      </script>
    </body></html>
  `);
});

// Serve static assets from KV bucket
app.get('/*', serveStatic({ root: './' }));

export default app;
