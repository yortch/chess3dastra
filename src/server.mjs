import http from 'node:http';
import { readFile } from 'node:fs/promises';
http.createServer(async (req, res) => {
  if (req.url?.split('?')[0] !== '/') { res.writeHead(404); res.end(); return; }
  try {
    const html = await readFile(new URL('./chess.html', import.meta.url));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (error) {
    console.error(error);
    res.writeHead(500); res.end('Unable to load chess.html');
  }
}).listen(4178, '127.0.0.1', () => console.log('Chess ready at http://127.0.0.1:4178'));
