import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import AgentInstructionsPage from '../src/app/agent-instructions/page'
import { GET as markdown } from '../src/app/agent-instructions.md/route'
import { GET as helper } from '../src/app/agent-instructions/helper.mjs/route'
import { AGENT_INSTRUCTION_SECTIONS } from '../src/lib/agent-instructions'

async function serverPageTree() {
  return JSON.stringify(await AgentInstructionsPage(), (key, value) =>
    key === 'type' && typeof value !== 'string' ? '[component]' : value)
}

test('server page and Markdown expose the same workflow without client-side fetching', async () => {
  // Playwright transforms JSX to its own element representation. Inspect the
  // server component tree here; raw HTTP HTML is checked against the dev server.
  const html = await serverPageTree()
  const response = await markdown()
  const text = await response.text()
  expect(response.headers.get('content-type')).toContain('text/markdown')
  for (const section of AGENT_INSTRUCTION_SECTIONS) {
    expect(html).toContain(section.title)
    expect(text).toContain(section.text)
  }
  for (const required of ['project_key', '/api/cli/link/start', '/api/cli/link/status', '/api/graves', '/grave/RECORD_ID']) {
    expect(html).toContain(required)
    expect(text).toContain(required)
  }
  expect(html).toContain('"href":"/agent-instructions.md"')
  expect(html).not.toContain('"type":"button"')
  expect(html).not.toContain('Copy prompt')
  expect(text).not.toContain('install.sh')
  expect(text).not.toContain('CLAUDE_SKILL_DIR')
  expect(text).not.toMatch(/skill|\/bury/i)
  expect(html).not.toMatch(/skill installation|\/skills\/bury/i)
})

test('published helper matches the SHA-256 in both instruction formats', async () => {
  const response = await helper()
  const source = await response.text()
  const hash = createHash('sha256').update(source).digest('hex')
  expect(response.headers.get('content-type')).toContain('text/javascript')
  expect(source).toContain('export async function sendBurial')
  expect(await (await markdown()).text()).toContain(`SHA-256: ${hash}`)
  expect(await serverPageTree()).toContain(hash)
})

test('published helper runs from a temporary folder with a fresh account profile and no installed skill', async () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'vc-one-shot-'))
  const home = path.join(fixture, 'home')
  const project = path.join(fixture, 'project')
  try {
    mkdirSync(home)
    mkdirSync(project)
    writeFileSync(path.join(project, 'index.html'), '<h1>Abandoned project</h1>')
    writeFileSync(path.join(fixture, 'helper.mjs'), await (await helper()).text())
    writeFileSync(path.join(fixture, 'check.mjs'), `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as helper from './helper.mjs';
const project = process.argv[2];
const { entries } = helper.loadRegistry();
assert.deepEqual(entries, []);
const candidates = helper.detectProjectCandidates(project, { registryEntries: entries });
assert.equal(candidates.length, 1);
const info = helper.inspectProject(candidates[0].path);
assert.equal(info.status, 'Untracked');
assert.ok('main_language' in info);
assert.match(info.project_key, /^sha256:[a-f0-9]{64}$/);
helper.saveConfig({ cli_token: 'vc_cli_test_only' });
const { config } = helper.loadConfig();
let requests = 0;
const payload = { name: info.name, cause: 'Retired', project_key: info.project_key, map_version: 'v1' };
const result = await helper.sendBurial(payload, config.cli_token, async (url, options) => {
  requests++;
  assert.equal(url, 'https://vibecemetery.app/api/graves');
  assert.equal(options.headers.Authorization, 'Bearer vc_cli_test_only');
  const body = JSON.parse(options.body);
  assert.equal(body.project_key, info.project_key);
  assert.equal(body.github_url, undefined);
  return Response.json({ id: '00000000-0000-4000-8000-000000000042', name: info.name, cause: body.cause }, { status: 201 });
});
assert.equal(result.ok, true);
assert.equal(result.record_id, '00000000-0000-4000-8000-000000000042');
helper.saveRegistry([{ ...info, cause: payload.cause, buried_at: '2026-09-06' }]);
assert.equal(helper.loadRegistry().entries.length, 1);
assert.equal(helper.detectProjectCandidates(project, { registryEntries: helper.loadRegistry().entries })[0].status, 'Buried');
assert.deepEqual(fs.readdirSync(project), ['index.html']);
assert.equal(fs.existsSync(path.join(process.env.HOME, '.claude')), false);
assert.equal(requests, 1);
console.log('temporary helper workflow passed with mock API');
`)
    const output = execFileSync(process.execPath, [path.join(fixture, 'check.mjs'), project], {
      cwd: fixture,
      env: { ...process.env, HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'AppData', 'Roaming') },
      encoding: 'utf8', timeout: 20_000, windowsHide: true,
    })
    expect(output.trim()).toBe('temporary helper workflow passed with mock API')
  } finally {
    if (path.dirname(fixture) !== path.resolve(tmpdir()) || !path.basename(fixture).startsWith('vc-one-shot-')) {
      throw new Error('Refusing cleanup outside the test fixture')
    }
    rmSync(fixture, { recursive: true, force: true })
  }
})
