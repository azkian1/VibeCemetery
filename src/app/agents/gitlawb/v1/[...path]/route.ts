import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const PUBLIC_BASE_URL = 'https://vibecemetery.app/agents/gitlawb/v1';
const SKILL_ROOT = join(process.cwd(), 'SKILL');

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
  const body = await readFile(sourceFile, 'utf8');
  return createHash('sha256').update(body).digest('hex');
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

async function getManifest() {
  const files = await Promise.all([...INSTALLER_FILES, ...FILES].map(async (file) => ({
    url: `/agents/gitlawb/v1/${file.publicPath}`,
    source: file.sourcePath,
    ...('target' in file ? { target: file.target } : {}),
    sha256: await sha256File(file.sourceFile),
  })));

  return {
    name: 'gitlawb',
    version: '1.0.0',
    kind: 'agent-ash-skill',
    base_url: PUBLIC_BASE_URL,
    target_root: '~/.hermes/skills/gitlawb',
    payload_sha256: getPayloadSha256(files),
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
    return Response.json(await getManifest());
  }

  const file = SERVED_FILES.get(requestPath);
  if (!file) {
    return notFound();
  }

  const body = await readFile(file.sourceFile, 'utf8');
  return new Response(body, {
    headers: {
      'content-type': file.contentType,
      'cache-control': 'public, max-age=300',
    },
  });
}

export { GET };
