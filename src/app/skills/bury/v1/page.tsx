import { permanentRedirect } from 'next/navigation'

export default function LegacyBurySkillPage() {
  permanentRedirect('/agent-instructions')
}
