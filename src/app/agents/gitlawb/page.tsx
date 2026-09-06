import {
  GITLAWB_OFFICIAL_SETUP_URL,
  getAgentAshInstallContract,
  getAgentAshPowerShellInstallCommand,
  getAgentAshSkillInstallCommand,
  getAgentAshSkillInstallLink,
  getAgentAshSkillInstallSource,
} from '@/lib/agent-ash-install'

export const metadata = {
  title: 'Paused VibeCemetery Agent Skill for GitLawb',
  robots: { index: false, follow: false },
}

export default function GitlawbAgentInstallPage() {
  const installContract = getAgentAshInstallContract()

  return (
    <main style={{ minHeight: '100vh', background: '#14130f', color: '#d7c79a', fontFamily: 'monospace', padding: 24 }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <h1 style={{ color: '#e8d5a3', fontSize: 24, margin: '0 0 12px' }}>
          Paused VibeCemetery Agent Skill for GitLawb
        </h1>

        <p style={{ color: '#aaa9a0', lineHeight: 1.6 }}>
          The GitLawb / Agent Ash experiment is paused until the cemetery is more populated.
          VibeCemetery does not install GitLawb. This page remains for direct legacy links and future audit work, not as an active product setup path.
          Official GitLawb setup URL: https://gitlawb.com/.
          Archived distribution route: /agents/gitlawb/v1.
        </p>

        <section style={{ border: '1px solid rgba(200,80,60,0.42)', padding: 16, margin: '18px 0', background: 'rgba(80,20,12,0.18)' }}>
          <h2 style={{ color: '#e8a08a', fontSize: 15, margin: '0 0 10px' }}>Paused Status</h2>
          <p style={{ whiteSpace: 'pre-wrap', color: '#c6b6a6', margin: 0, lineHeight: 1.6 }}>
            Do not install this archived Agent Skill for normal VibeCemetery use. Use the human cemetery, GitHub scan, local project burials instead.
          </p>
        </section>

        <section style={{ border: '1px solid rgba(200,160,80,0.28)', padding: 16, margin: '18px 0', background: 'rgba(0,0,0,0.22)' }}>
          <h2 style={{ color: '#c8a050', fontSize: 15, margin: '0 0 10px' }}>Official GitLawb Setup</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#aaa9a0', margin: 0 }}>{GITLAWB_OFFICIAL_SETUP_URL}</pre>
        </section>

        <section style={{ border: '1px solid rgba(200,160,80,0.28)', padding: 16, margin: '18px 0', background: 'rgba(0,0,0,0.22)' }}>
          <h2 style={{ color: '#c8a050', fontSize: 15, margin: '0 0 10px' }}>Site-Hosted Agent Skill Source</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#aaa9a0', margin: 0 }}>{getAgentAshSkillInstallSource()}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#aaa9a0', margin: '10px 0 0' }}>{getAgentAshSkillInstallLink()}</pre>
        </section>

        <section style={{ border: '1px solid rgba(200,160,80,0.28)', padding: 16, margin: '18px 0', background: 'rgba(0,0,0,0.22)' }}>
          <h2 style={{ color: '#c8a050', fontSize: 15, margin: '0 0 10px' }}>Archived Install Commands</h2>
          <p style={{ color: '#aaa9a0', margin: '0 0 8px' }}>macOS/Linux</p>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#aaa9a0', margin: 0 }}>{getAgentAshSkillInstallCommand()}</pre>
          <p style={{ color: '#aaa9a0', margin: '12px 0 8px' }}>Windows PowerShell</p>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#aaa9a0', margin: 0 }}>{getAgentAshPowerShellInstallCommand()}</pre>
        </section>

        <section style={{ border: '1px solid rgba(200,160,80,0.28)', padding: 16, margin: '18px 0', background: 'rgba(0,0,0,0.22)' }}>
          <h2 style={{ color: '#c8a050', fontSize: 15, margin: '0 0 10px' }}>Install Path</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#aaa9a0', margin: 0 }}>~/.hermes/skills/gitlawb</pre>
        </section>

        <section style={{ border: '1px solid rgba(200,160,80,0.28)', padding: 16, margin: '18px 0', background: 'rgba(0,0,0,0.22)' }}>
          <h2 style={{ color: '#c8a050', fontSize: 15, margin: '0 0 10px' }}>Full Agent Contract</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#aaa9a0', lineHeight: 1.5, margin: 0 }}>{installContract}</pre>
        </section>

        <p style={{ color: '#77746a', lineHeight: 1.6 }}>
          Boundary if revived: use ash_ Agent Ash ingest authorization credentials only. They are not ERC-20, points, rewards, or tokenomics value.
          Submit verified Ash only to /api/agent-ashes.
        </p>
      </div>
    </main>
  )
}
