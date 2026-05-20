import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const PUBLIC_BASE_URL = 'https://vibecemetery.app/skills/bury/v1';
const SKILL_ROOT = join(process.cwd(), 'SKILL');

const FILES = [
  {
    publicPath: 'files/commands/bury.md',
    sourcePath: 'SKILL/commands/bury.md',
    sourceFile: join(SKILL_ROOT, 'commands', 'bury.md'),
    target: '~/.claude/commands/bury.md',
    contentType: 'text/markdown; charset=utf-8',
  },
  {
    publicPath: 'files/skills/bury-workflow/SKILL.md',
    sourcePath: 'SKILL/skills/bury-workflow/SKILL.md',
    sourceFile: join(SKILL_ROOT, 'skills', 'bury-workflow', 'SKILL.md'),
    target: '~/.claude/skills/bury-workflow/SKILL.md',
    contentType: 'text/markdown; charset=utf-8',
  },
  {
    publicPath: 'files/skills/bury-workflow/scripts/bury-helper.mjs',
    sourcePath: 'SKILL/skills/bury-workflow/scripts/bury-helper.mjs',
    sourceFile: join(SKILL_ROOT, 'skills', 'bury-workflow', 'scripts', 'bury-helper.mjs'),
    target: '~/.claude/skills/bury-workflow/scripts/bury-helper.mjs',
    contentType: 'text/javascript; charset=utf-8',
  },
  {
    publicPath: 'files/skills/bury-workflow/references/contract.md',
    sourcePath: 'SKILL/skills/bury-workflow/references/contract.md',
    sourceFile: join(SKILL_ROOT, 'skills', 'bury-workflow', 'references', 'contract.md'),
    target: '~/.claude/skills/bury-workflow/references/contract.md',
    contentType: 'text/markdown; charset=utf-8',
  },
  {
    publicPath: 'files/skills/bury-workflow/references/security.md',
    sourcePath: 'SKILL/skills/bury-workflow/references/security.md',
    sourceFile: join(SKILL_ROOT, 'skills', 'bury-workflow', 'references', 'security.md'),
    target: '~/.claude/skills/bury-workflow/references/security.md',
    contentType: 'text/markdown; charset=utf-8',
  },
  {
    publicPath: 'files/skills/bury-workflow/references/character.md',
    sourcePath: 'SKILL/skills/bury-workflow/references/character.md',
    sourceFile: join(SKILL_ROOT, 'skills', 'bury-workflow', 'references', 'character.md'),
    target: '~/.claude/skills/bury-workflow/references/character.md',
    contentType: 'text/markdown; charset=utf-8',
  },
];

const INSTALLER_FILES = [
  {
    publicPath: 'install.sh',
    sourcePath: 'SKILL/install/install-bury.sh',
    sourceFile: join(SKILL_ROOT, 'install', 'install-bury.sh'),
    contentType: 'text/x-shellscript; charset=utf-8',
  },
  {
    publicPath: 'install.ps1',
    sourcePath: 'SKILL/install/install-bury.ps1',
    sourceFile: join(SKILL_ROOT, 'install', 'install-bury.ps1'),
    contentType: 'text/plain; charset=utf-8',
  },
  {
    publicPath: 'SKILL/install/install-contract.mjs',
    sourcePath: 'SKILL/install/install-contract.mjs',
    sourceFile: join(SKILL_ROOT, 'install', 'install-contract.mjs'),
    contentType: 'text/javascript; charset=utf-8',
  },
  {
    publicPath: 'SKILL/install/install-runner.mjs',
    sourcePath: 'SKILL/install/install-runner.mjs',
    sourceFile: join(SKILL_ROOT, 'install', 'install-runner.mjs'),
    contentType: 'text/javascript; charset=utf-8',
  },
];

const SERVED_FILES = new Map(
  [...FILES, ...FILES.map((file) => ({ ...file, publicPath: file.sourcePath })), ...INSTALLER_FILES]
    .map((file) => [file.publicPath, file]),
);

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
    .filter((file) => !['SKILL/install/install-bury.sh', 'SKILL/install/install-bury.ps1'].includes(file.source))
    .map((file) => ({ source: file.source, sha256: file.sha256 }));

  return sha256Text(JSON.stringify({ files: payloadFiles }));
}

async function getManifest() {
  const manifestFiles = [...INSTALLER_FILES, ...FILES];
  const files = await Promise.all(manifestFiles.map(async (file) => ({
    url: `/skills/bury/v1/${file.publicPath}`,
    source: file.sourcePath,
    ...('target' in file ? { target: file.target } : {}),
    sha256: await sha256File(file.sourceFile),
  })));

  return {
    name: 'bury',
    version: '1.0.0',
    base_url: PUBLIC_BASE_URL,
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
