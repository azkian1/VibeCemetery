import { getInstallerCommand } from '../../../../../SKILL/install/install-contract.mjs';

const baseUrl = 'https://vibecemetery.app/skills/bury/v1';
const macInstallCommand = 'curl -fsSL https://vibecemetery.app/skills/bury/v1/install.sh | bash';
const windowsInstallCommand = 'powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr https://vibecemetery.app/skills/bury/v1/install.ps1 -UseBasicParsing | iex"';

const sourceFiles = [
  ['Command', '/skills/bury/v1/files/commands/bury.md', '~/.claude/commands/bury.md'],
  ['Workflow skill', '/skills/bury/v1/files/skills/bury-workflow/SKILL.md', '~/.claude/skills/bury-workflow/SKILL.md'],
  ['Helper script', '/skills/bury/v1/files/skills/bury-workflow/scripts/bury-helper.mjs', '~/.claude/skills/bury-workflow/scripts/bury-helper.mjs'],
  ['Contract reference', '/skills/bury/v1/files/skills/bury-workflow/references/contract.md', '~/.claude/skills/bury-workflow/references/contract.md'],
  ['Security reference', '/skills/bury/v1/files/skills/bury-workflow/references/security.md', '~/.claude/skills/bury-workflow/references/security.md'],
  ['Character reference', '/skills/bury/v1/files/skills/bury-workflow/references/character.md', '~/.claude/skills/bury-workflow/references/character.md'],
];

function CodeBlock({ children }: { children: string }) {
  return (
    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'rgba(20, 18, 16, 0.78)', border: '1px solid rgba(180, 160, 120, 0.22)', borderRadius: 10, padding: 14, color: '#e8d5a3', fontSize: 13, lineHeight: 1.55 }}>
      <code>{children}</code>
    </pre>
  );
}

export default function BurySkillV1Page() {
  return (
    <main style={{ minHeight: '100vh', background: '#10100f', color: '#d8d0bc', fontFamily: 'Cinzel, Georgia, serif', padding: '48px 18px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', border: '1px solid rgba(180, 160, 120, 0.24)', borderRadius: 18, padding: '32px 28px', background: 'linear-gradient(180deg, rgba(49,45,38,0.92), rgba(22,21,19,0.96))', boxShadow: '0 18px 60px rgba(0,0,0,0.42)' }}>
        <p style={{ margin: '0 0 8px', color: '#8d887b', letterSpacing: 2, fontSize: 12 }}>CLI SKILL</p>
        <h1 style={{ margin: '0 0 14px', color: '#e8d5a3', fontSize: 34 }}>Install /bury</h1>
        <p style={{ margin: '0 0 28px', color: '#aaa9a0', lineHeight: 1.7 }}>
          Install /bury locally for Claude Code, OpenCode, Cursor, and other tools that can read Claude-compatible ~/.claude command and skill directories. This page is the canonical public distribution point for the human CLI cremation skill.
        </p>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ color: '#e8d5a3', fontSize: 20 }}>Install commands</h2>
          <p style={{ color: '#aaa9a0' }}>macOS/Linux</p>
          <CodeBlock>{getInstallerCommand('macOS') || macInstallCommand}</CodeBlock>
          <p style={{ color: '#aaa9a0' }}>Windows PowerShell</p>
          <CodeBlock>{getInstallerCommand('Windows') || windowsInstallCommand}</CodeBlock>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ color: '#e8d5a3', fontSize: 20 }}>What /bury does</h2>
          <p style={{ color: '#aaa9a0', lineHeight: 1.7 }}>
            /bury checks a local project, confirms it is safe to cremate, opens browser-approved VibeCemetery CLI auth, and submits a human cremation record to /api/cremated. It does not install Agent Ash or submit agent certificates.
          </p>
          <p style={{ color: '#aaa9a0', lineHeight: 1.7 }}>
            If your tool reads skills from a different directory, use the file links below as the source of truth and copy them to your tool-specific location manually.
          </p>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ color: '#e8d5a3', fontSize: 20 }}>What will be installed</h2>
          <p style={{ color: '#aaa9a0' }}>Target paths</p>
          <ul style={{ color: '#c9c0ad', lineHeight: 1.8, paddingLeft: 22 }}>
            <li>~/.claude/commands/bury.md</li>
            <li>~/.claude/skills/bury-workflow/</li>
          </ul>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ color: '#e8d5a3', fontSize: 20 }}>View skill contents</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {sourceFiles.map(([label, href, target]) => (
              <a key={href} href={href} style={{ color: '#9fb6d0', textDecoration: 'none', border: '1px solid rgba(159,182,208,0.2)', borderRadius: 10, padding: 12, background: 'rgba(8,8,8,0.22)' }}>
                {label}: {target}
              </a>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ color: '#e8d5a3', fontSize: 20 }}>Security boundaries</h2>
          <p style={{ color: '#aaa9a0', lineHeight: 1.7 }}>
            The installer writes only inside ~/.claude, uses a fixed file list, rejects path traversal and symlink or junction targets, backs up existing files, rolls back on failure, and restricts source overrides to localhost test origins.
          </p>
        </section>

        <section>
          <h2 style={{ color: '#e8d5a3', fontSize: 20 }}>Manual install notes</h2>
          <p style={{ color: '#aaa9a0', lineHeight: 1.7 }}>
            The manifest is available at <a href="/skills/bury/v1/manifest.json" style={{ color: '#9fb6d0' }}>{baseUrl}/manifest.json</a>. If installing manually, place the command and workflow files at the target paths above, then restart Claude Code and run /bury.
          </p>
        </section>
      </div>
    </main>
  );
}
