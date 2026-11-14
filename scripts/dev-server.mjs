import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { exec } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 5175);
const HTML = 'dist/ui.html';

if (!existsSync(HTML)) {
  console.error('[dev:ui] dist/ui.html is missing. Run "pnpm build" first.');
  process.exit(1);
}

const server = createServer(async (req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const html = await readFile(HTML, 'utf8');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/`;
  console.log(`[dev:ui] UI harness running at ${url}`);
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => undefined);
});
