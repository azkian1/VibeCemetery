import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const PUBLIC_BASE_URL = 'https://vibecemetery.app/agents/gitlawb/v1';
const SKILL_ROOT = join(process.cwd(), 'SKILL');
const PAYLOAD_SHA256_PLACEHOLDER = '__AGENT_ASH_PAYLOAD_SHA256__';
const DISTRIBUTION_HEADERS = {
  'cache-control': 'no-store',
};

const FILES = [
  {
    publicPath: 'files/skills/gitlawb/SKILL.md',
    sourcePath: 'SKILL/skills/gitlawb/SKILL.md',
    sourceFile: join(SKILL_ROOT, 'skills', 'gitlawb', 'SKILL.md'),
    target: 'SKILL.md',
    contentType: 'text/markdown; charset=utf-8',
  },
  {
    publicPath: 'files/skills/gitlawb/scripts/gitlawb-helper.mjs',
    sourcePath: 'SKILL/skills/gitlawb/scripts/gitlawb-helper.mjs',
    sourceFile: join(SKILL_ROOT, 'skills', 'gitlawb', 'scripts', 'gitlawb-helper.mjs'),
    target: 'scripts/gitlawb-helper.mjs',
    contentType: 'text/javascript; charset=utf-8',
  },
];

const INSTALLER_FILES = [
  {
    publicPath: 'install.sh',
    sourcePath: 'SKILL/agent-install/install-gitlawb.sh',
    sourceFile: join(SKILL_ROOT, 'agent-install', 'install-gitlawb.sh'),
    contentType: 'text/x-shellscript; charset=utf-8',
  },
  {
    publicPath: 'install.ps1',
    sourcePath: 'SKILL/agent-install/install-gitlawb.ps1',
    sourceFile: join(SKILL_ROOT, 'agent-install', 'install-gitlawb.ps1'),
    contentType: 'text/plain; charset=utf-8',
  },
  {
    publicPath: 'SKILL/agent-install/install-gitlawb-runner.mjs',
    sourcePath: 'SKILL/agent-install/install-gitlawb-runner.mjs',
    sourceFile: join(SKILL_ROOT, 'agent-install', 'install-gitlawb-runner.mjs'),
    contentType: 'text/javascript; charset=utf-8',
  },
];

const SERVED_FILES = new Map([...INSTALLER_FILES, ...FILES].map((file) => [file.publicPath, file]));

function notFound() {
  return new Response('Not found', { status: 404 });
}

async function sha256File(sourceFile: string) {
  return sha256Text(await readFile(sourceFile, 'utf8'));
}

function sha256Text(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function getPayloadSha256(files: Array<{ source: string; sha256: string }>) {
  const payloadFiles = files
    .filter((file) => !['SKILL/agent-install/install-gitlawb.sh', 'SKILL/agent-install/install-gitlawb.ps1'].includes(file.source))
    .map((file) => ({ source: file.source, sha256: file.sha256 }));
  return sha256Text(JSON.stringify({ files: payloadFiles }));
}

async function renderServedBody(file: { sourceFile: string; sourcePath: string }, payloadSha256: string) {
  const body = await readFile(file.sourceFile, 'utf8');
  if (file.sourcePath === 'SKILL/agent-install/install-gitlawb.sh' || file.sourcePath === 'SKILL/agent-install/install-gitlawb.ps1') {
    return body.replace(PAYLOAD_SHA256_PLACEHOLDER, payloadSha256);
  }
  return body;
}

async function getManifest() {
  const payloadEntries = await Promise.all([...INSTALLER_FILES.slice(2), ...FILES].map(async (file) => ({
    url: `/agents/gitlawb/v1/${file.publicPath}`,
    source: file.sourcePath,
    ...('target' in file ? { target: file.target } : {}),
    sha256: await sha256File(file.sourceFile),
  })));
  const payloadSha256 = getPayloadSha256(payloadEntries);
  const installerEntries = await Promise.all(INSTALLER_FILES.slice(0, 2).map(async (file) => ({
    url: `/agents/gitlawb/v1/${file.publicPath}`,
    source: file.sourcePath,
    sha256: sha256Text(await renderServedBody(file, payloadSha256)),
  })));
  const files = [...installerEntries, ...payloadEntries];

  return {
    name: 'gitlawb',
    version: '1.0.0',
    kind: 'agent-ash-skill',
    base_url: PUBLIC_BASE_URL,
    target_root: '~/.hermes/skills/gitlawb',
    payload_sha256: payloadSha256,
    files,
  };
}

async function GET(_request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const params = await context.params;
  const requestPath = params.path?.join('/') ?? '';

  if (!requestPath || requestPath.includes('..')) {
    return notFound();
  }

  if (requestPath === 'manifest.json') {
    return Response.json(await getManifest(), { headers: DISTRIBUTION_HEADERS });
  }

  const file = SERVED_FILES.get(requestPath);
  if (!file) {
    return notFound();
  }

  const manifest = await getManifest();
  const body = await renderServedBody(file, manifest.payload_sha256);
  return new Response(body, {
    headers: {
      ...DISTRIBUTION_HEADERS,
      'content-type': file.contentType,
    },
  });
}

export { GET };
