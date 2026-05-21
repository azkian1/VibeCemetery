const baseUrl = 'https://vibecemetery.app/agents/gitlawb/v1';
const manifestHref = '/agents/gitlawb/v1/manifest.json';
const macInstallCommand = 'curl -fsSL https://vibecemetery.app/agents/gitlawb/v1/install.sh | bash';
const windowsInstallCommand = 'powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr https://vibecemetery.app/agents/gitlawb/v1/install.ps1 -UseBasicParsing | iex"';

const sourceFiles = [
  ['Skill contract', '/agents/gitlawb/v1/files/skills/gitlawb/SKILL.md', 'SKILL.md'],
  ['Helper script', '/agents/gitlawb/v1/files/skills/gitlawb/scripts/gitlawb-helper.mjs', 'scripts/gitlawb-helper.mjs'],
];

function CodeBlock({ children }: { children: string }) {
  return (
    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'rgba(20, 18, 16, 0.78)', border: '1px solid rgba(180, 160, 120, 0.22)', borderRadius: 10, padding: 14, color: '#e8d5a3', fontSize: 13, lineHeight: 1.55 }}>
      <code>{children}</code>
    </pre>
  );
}

export const metadata = {
  title: 'VibeCemetery Agent Skill for GitLawb',
  robots: { index: false, follow: false },
};

export default function GitlawbAgentSkillV1Page() {
  return (
    <main style={{ minHeight: '100vh', background: '#10100f', color: '#d8d0bc', fontFamily: 'Cinzel, Georgia, serif', padding: '48px 18px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', border: '1px solid rgba(180, 160, 120, 0.24)', borderRadius: 18, padding: '32px 28px', background: 'linear-gradient(180deg, rgba(49,45,38,0.92), rgba(22,21,19,0.96))', boxShadow: '0 18px 60px rgba(0,0,0,0.42)' }}>
        <p style={{ margin: '0 0 8px', color: '#8d887b', letterSpacing: 2, fontSize: 12 }}>AGENT SKILL</p>
        <h1 style={{ margin: '0 0 14px', color: '#e8d5a3', fontSize: 34 }}>VibeCemetery Agent Skill for GitLawb</h1>
        <p style={{ margin: '0 0 28px', color: '#aaa9a0', lineHeight: 1.7 }}>
          Stable VibeCemetery-hosted source mirror for the VibeCemetery Agent Skill for GitLawb. VibeCemetery does not install GitLawb; use the official GitLawb setup first.
          Current production writes use browser-approved delegated ash_ tokens; native submit-one-shot is readiness/future-only until backend AgentDID verification lands.
        </p>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ color: '#e8d5a3', fontSize: 20 }}>Official GitLawb setup</h2>
          <CodeBlock>https://gitlawb.com/</CodeBlock>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ color: '#e8d5a3', fontSize: 20 }}>Manifest</h2>
          <p style={{ color: '#aaa9a0', lineHeight: 1.7 }}>
            The manifest lists the exact allowlisted source files, target paths, SHA-256 hashes, and a non-cyclic payload hash.
          </p>
          <CodeBlock>{`${baseUrl}${manifestHref.replace('/agents/gitlawb/v1', '')}`}</CodeBlock>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ color: '#e8d5a3', fontSize: 20 }}>Install commands</h2>
          <p style={{ color: '#aaa9a0' }}>macOS/Linux</p>
          <CodeBlock>{macInstallCommand}</CodeBlock>
          <p style={{ color: '#aaa9a0' }}>Windows PowerShell</p>
          <CodeBlock>{windowsInstallCommand}</CodeBlock>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ color: '#e8d5a3', fontSize: 20 }}>Source files</h2>
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
            The mirror serves only manifest.json, the installer files, SKILL.md, and scripts/gitlawb-helper.mjs from a fixed allowlist. Unknown paths and path traversal attempts return 404. Agent Ash uses browser-approved delegated ash_ tokens for current production writes and submits verified records only to /api/agent-ashes.
          </p>
        </section>

        <section>
          <h2 style={{ color: '#e8d5a3', fontSize: 20 }}>Not included</h2>
          <p style={{ color: '#aaa9a0', lineHeight: 1.7 }}>
            This page does not install GitLawb, create graves, call /api/cremated, reuse human CLI tokens, or award SOUL, points, rewards, or tokenomics value.
          </p>
        </section>
      </div>
    </main>
  );
}
