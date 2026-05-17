import {
  getHermesInstallPrompt,
  getHermesSkillInstallCommand,
  getHermesSkillInstallLink,
  getHermesSkillInstallSource,
} from '@/components/modals/skillInstall'

export const metadata = {
  title: 'Hermes / OpenClaw GitLawb Agent Ash install',
  robots: { index: false, follow: false },
}

export default function GitlawbAgentInstallPage() {
  const installPrompt = getHermesInstallPrompt()

  return (
    <main style={{ minHeight: '100vh', background: '#14130f', color: '#d7c79a', fontFamily: 'monospace', padding: 24 }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <h1 style={{ color: '#e8d5a3', fontSize: 24, margin: '0 0 12px' }}>
          Hermes / OpenClaw GitLawb Agent Ash install
        </h1>

        <p style={{ color: '#aaa9a0', lineHeight: 1.6 }}>
          Agent instruction: install the VibeCemetery GitLawb Agent Ash skill from this explicit source,
          then follow the contract below. This is not the human /bury flow.
        </p>

        <section style={{ border: '1px solid rgba(200,160,80,0.28)', padding: 16, margin: '18px 0', background: 'rgba(0,0,0,0.22)' }}>
          <h2 style={{ color: '#c8a050', fontSize: 15, margin: '0 0 10px' }}>Pinned Source</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#aaa9a0', margin: 0 }}>{getHermesSkillInstallSource()}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#aaa9a0', margin: '10px 0 0' }}>{getHermesSkillInstallLink()}</pre>
        </section>

        <section style={{ border: '1px solid rgba(200,160,80,0.28)', padding: 16, margin: '18px 0', background: 'rgba(0,0,0,0.22)' }}>
          <h2 style={{ color: '#c8a050', fontSize: 15, margin: '0 0 10px' }}>Install Command</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#aaa9a0', margin: 0 }}>{getHermesSkillInstallCommand()}</pre>
        </section>

        <section style={{ border: '1px solid rgba(200,160,80,0.28)', padding: 16, margin: '18px 0', background: 'rgba(0,0,0,0.22)' }}>
          <h2 style={{ color: '#c8a050', fontSize: 15, margin: '0 0 10px' }}>Full Agent Contract</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#aaa9a0', lineHeight: 1.5, margin: 0 }}>{installPrompt}</pre>
        </section>

        <p style={{ color: '#77746a', lineHeight: 1.6 }}>
          Boundary: use ash_ Agent Ash ingest tokens only. Never use vc_cli_ human tokens. Never call /api/cremated.
          Submit verified Ash only to /api/agent-ashes.
        </p>
      </div>
    </main>
  )
}
