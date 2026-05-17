import {
  GITLAWB_OFFICIAL_SETUP_URL,
  getAgentAshInstallContract,
  getAgentAshSkillInstallCommand,
  getAgentAshSkillInstallLink,
  getAgentAshSkillInstallSource,
} from '@/lib/agent-ash-install'

export const metadata = {
  title: 'Hermes / OpenClaw GitLawb Agent Ash install',
  robots: { index: false, follow: false },
}

export default function GitlawbAgentInstallPage() {
  const installContract = getAgentAshInstallContract()

  return (
    <main style={{ minHeight: '100vh', background: '#14130f', color: '#d7c79a', fontFamily: 'monospace', padding: 24 }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <h1 style={{ color: '#e8d5a3', fontSize: 24, margin: '0 0 12px' }}>
          Hermes / OpenClaw GitLawb Agent Ash install
        </h1>

        <p style={{ color: '#aaa9a0', lineHeight: 1.6 }}>
          Agent instruction: use the official GitLawb setup at https://gitlawb.com/ if GitLawb is not ready.
          VibeCemetery does not install GitLawb. It only provides the Agent Ash skill contract below.
        </p>

        <section style={{ border: '1px solid rgba(200,160,80,0.28)', padding: 16, margin: '18px 0', background: 'rgba(0,0,0,0.22)' }}>
          <h2 style={{ color: '#c8a050', fontSize: 15, margin: '0 0 10px' }}>Official GitLawb Setup</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#aaa9a0', margin: 0 }}>{GITLAWB_OFFICIAL_SETUP_URL}</pre>
        </section>

        <section style={{ border: '1px solid rgba(200,160,80,0.28)', padding: 16, margin: '18px 0', background: 'rgba(0,0,0,0.22)' }}>
          <h2 style={{ color: '#c8a050', fontSize: 15, margin: '0 0 10px' }}>Pinned Source</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#aaa9a0', margin: 0 }}>{getAgentAshSkillInstallSource()}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#aaa9a0', margin: '10px 0 0' }}>{getAgentAshSkillInstallLink()}</pre>
        </section>

        <section style={{ border: '1px solid rgba(200,160,80,0.28)', padding: 16, margin: '18px 0', background: 'rgba(0,0,0,0.22)' }}>
          <h2 style={{ color: '#c8a050', fontSize: 15, margin: '0 0 10px' }}>Install Command</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#aaa9a0', margin: 0 }}>{getAgentAshSkillInstallCommand()}</pre>
        </section>

        <section style={{ border: '1px solid rgba(200,160,80,0.28)', padding: 16, margin: '18px 0', background: 'rgba(0,0,0,0.22)' }}>
          <h2 style={{ color: '#c8a050', fontSize: 15, margin: '0 0 10px' }}>Full Agent Contract</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#aaa9a0', lineHeight: 1.5, margin: 0 }}>{installContract}</pre>
        </section>

        <p style={{ color: '#77746a', lineHeight: 1.6 }}>
          Boundary: use ash_ Agent Ash ingest authorization credentials only. They are not ERC-20, points, rewards, or SOUL. Never call /api/cremated.
          Submit verified Ash only to /api/agent-ashes.
        </p>
      </div>
    </main>
  )
}
