import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// Requires running Docker. Uses only a disposable Redis container (no volumes,
// no published ports) and an ephemeral loopback HTTP adapter for Upstash REST.
const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const ts = require('typescript');
const container = `vibecemetery-redis-test-${process.pid}-${Date.now()}`;
const docker = async (...args) => (await exec('docker', args, { timeout: 120_000 })).stdout.trim();
const redis = async (...args) => JSON.parse(await docker('exec', container, 'redis-cli', '--json', ...args.map(String)));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let started = false;
let server;
const originalEnv = { ...process.env };
const originalError = console.error;

try {
  await docker('run', '--detach', '--rm', '--network', 'none', '--name', container,
    'redis:7-alpine', 'redis-server', '--save', '', '--appendonly', 'no');
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    try { ready = (await redis('PING')) === 'PONG'; } catch { /* still starting */ }
    if (ready) break;
    await sleep(100);
  }
  assert(ready, 'Redis did not become ready');

  let dropNextReply = false;
  let commandCount = 0;
  server = createServer(async (req, res) => {
    try {
      assert.equal(req.method, 'POST');
      assert.equal(req.headers.authorization, 'Bearer isolated-test');
      assert.equal(req.headers['content-type'], 'application/json');
      let body = '';
      for await (const chunk of req) body += chunk;
      const command = JSON.parse(body);
      assert.equal(command[0], 'EVAL');
      commandCount++;
      const result = await redis(...command);
      if (dropNextReply) {
        dropNextReply = false;
        req.socket.destroy();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(error) }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.UPSTASH_REDIS_REST_TOKEN = 'isolated-test';
  delete process.env.PLAYWRIGHT_E2E;

  // Load the actual production module, not a copied version of the Lua script.
  const source = fileURLToPath(new URL('../src/lib/rate-limit.ts', import.meta.url));
  const mod = new Module(source);
  mod.filename = source;
  mod.paths = require.resolve.paths('typescript');
  mod._compile(ts.transpileModule(readFileSync(source, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, source);
  const { checkRateLimit } = mod.exports;
  let fallbackCount = 0;
  console.error = (...args) => {
    fallbackCount++;
    originalError(...args);
  };

  const key = 'test:read:2001:db8::1/тест';
  assert.deepEqual(await checkRateLimit(key, 2, 4000), { allowed: true });
  const firstTTL = await redis('PTTL', key);
  assert(firstTTL > 0 && firstTTL <= 4000);
  await sleep(150);
  assert.deepEqual(await checkRateLimit(key, 2, 4000), { allowed: true });
  const secondTTL = await redis('PTTL', key);
  assert(secondTTL < firstTTL, 'Healthy fixed window must not be extended');
  const blocked = await checkRateLimit(key, 2, 4000);
  assert.equal(blocked.allowed, false);
  assert(blocked.retryAfterMs > 0 && blocked.retryAfterMs < firstTTL);
  console.log('PASS: real EVAL, request limit, special-character key, fixed TTL');

  await redis('SET', 'orphan', 100);
  assert.equal(await redis('PTTL', 'orphan'), -1);
  const repaired = await checkRateLimit('orphan', 2, 1000);
  assert.equal(repaired.allowed, false);
  assert(repaired.retryAfterMs > 0 && repaired.retryAfterMs <= 1000);
  const repairedTTL = await redis('PTTL', 'orphan');
  assert(repairedTTL > 0 && repairedTTL <= 1000);
  await sleep(1100);
  assert.deepEqual(await checkRateLimit('orphan', 2, 1000), { allowed: true });
  assert.equal(await redis('GET', 'orphan'), '1');
  console.log('PASS: legacy key without TTL repaired; block expires and counter resets');

  const results = await Promise.all(Array.from({ length: 12 }, () => checkRateLimit('parallel', 3, 15000)));
  assert.equal(results.filter((result) => result.allowed).length, 3);
  assert.equal(results.filter((result) => !result.allowed).length, 9);
  assert.equal(await redis('GET', 'parallel'), '12');
  assert(await redis('PTTL', 'parallel') > 0);
  assert.equal(fallbackCount, 0, 'Successful scenarios must not silently fall back');
  console.log('PASS: 12 parallel requests allow exactly 3; no lost increments or missing TTL');

  dropNextReply = true;
  const beforeDrop = commandCount;
  assert.deepEqual(await checkRateLimit('lost-reply', 1, 1000), { allowed: true });
  assert.equal(commandCount, beforeDrop + 1, 'A lost reply must not retry EVAL');
  assert.equal(fallbackCount, 1);
  const lostTTL = await redis('PTTL', 'lost-reply');
  assert(lostTTL > 0 && lostTTL <= 1000, 'Executed command must retain TTL despite lost HTTP reply');
  await sleep(1100);
  assert.deepEqual(await checkRateLimit('lost-reply', 1, 1000), { allowed: true });
  assert.equal(fallbackCount, 1);
  console.log('PASS: lost HTTP reply retains Redis expiry and recovers after window');
  console.log('All Redis integration checks passed.');
} finally {
  console.error = originalError;
  for (const key of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'PLAYWRIGHT_E2E']) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (started) await docker('rm', '--force', container);
}
