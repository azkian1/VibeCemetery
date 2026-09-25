import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const root = process.cwd();
const reviewDir = path.join(root, 'artifacts', 'grave-review');
const map = JSON.parse(await fs.readFile(path.join(root, 'public', 'map', 'cemetery-v2.tmj'), 'utf8'));
const approved = new Set(JSON.parse(await fs.readFile(path.join(reviewDir, 'approved-v1.json'), 'utf8')).accepted.map(item => item.gid));
const files = (await fs.readdir(reviewDir)).filter(name => /^\d{2}_(tall|wide|large)_.+\.png$/.test(name));
const models = files.map(filename => {
  const gid = Number(filename.slice(0, 2));
  const type = gid <= 76 ? 'Высокое' : gid <= 85 ? 'Широкое' : 'Крупное';
  const name = map.tilesets.find(tileset => tileset.firstgid === gid)?.name;
  if (!name) throw new Error(`No grave model for GID ${gid}`);
  return { gid, type, name, filename, locked: approved.has(gid) };
}).sort((a, b) => a.gid - b.gid);
if (models.length !== 47 || models.some((model, index) => model.gid !== 51 + index)) {
  throw new Error('Expected exactly 47 review images, GID 51–97');
}
const fileSet = new Set(files);
const selectionPath = path.join(reviewDir, 'review-selection.json');

function respond(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
function json(res, code, value) {
  respond(res, code, 'application/json; charset=utf-8', JSON.stringify(value));
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:3001');
    if (req.method === 'GET' && url.pathname === '/') {
      return respond(res, 200, 'text/html; charset=utf-8', await fs.readFile(path.join(reviewDir, 'index.html')));
    }
    if (req.method === 'GET' && url.pathname === '/api/models') return json(res, 200, models);
    if (req.method === 'GET' && url.pathname === '/api/review') {
      let saved = { choices: null, savedAt: null };
      try { saved = JSON.parse(await fs.readFile(selectionPath, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      return json(res, 200, saved);
    }
    if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
      const filename = decodeURIComponent(url.pathname.slice('/assets/'.length));
      if (!fileSet.has(filename)) return respond(res, 404, 'text/plain', 'Asset not found');
      return respond(res, 200, 'image/png', await fs.readFile(path.join(reviewDir, filename)));
    }
    if (req.method === 'POST' && url.pathname === '/api/review') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 100_000) return respond(res, 413, 'text/plain', 'Request too large');
      }
      const incoming = JSON.parse(body).choices;
      if (!incoming || typeof incoming !== 'object'
        || Object.keys(incoming).length !== models.length
        || models.some(model => !['pass', 'fail'].includes(incoming[model.gid])
          || (model.locked && incoming[model.gid] !== 'pass'))) {
        return respond(res, 400, 'text/plain', 'Select Pass or No for all 47 models');
      }
      const choices = Object.fromEntries(models.map(model => [model.gid, incoming[model.gid]]));
      const accepted = models.filter(model => choices[model.gid] === 'pass').map(model => model.gid);
      const redo = models.filter(model => choices[model.gid] === 'fail').map(model => model.gid);
      const savedAt = new Date().toISOString();
      await fs.writeFile(selectionPath, `${JSON.stringify({ savedAt, accepted, redo, choices }, null, 2)}\n`);
      return json(res, 200, { passed: accepted.length, failed: redo.length, savedAt });
    }
    respond(res, 404, 'text/plain', 'Not found');
  } catch (error) {
    respond(res, 500, 'text/plain', error.message);
  }
});
server.listen(3001, '127.0.0.1', () => {
  console.log('Grave review: http://127.0.0.1:3001');
});
