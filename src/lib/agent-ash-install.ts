export const GITLAWB_OFFICIAL_SETUP_URL = 'https://gitlawb.com/'
export const AGENT_INSTALL_PATH = '/agents/gitlawb'

const AGENT_ASH_SKILL_SOURCE_CONTRACT = {
  siteBaseUrl: 'https://vibecemetery.app/agents/gitlawb/v1',
  skillPath: '~/.hermes/skills/gitlawb',
}

function getAgentAshInstallPath() {
  return AGENT_INSTALL_PATH
}

function getAgentAshSkillInstallSource() {
  return AGENT_ASH_SKILL_SOURCE_CONTRACT.siteBaseUrl
}

function getAgentAshSkillInstallLink() {
  return `${AGENT_ASH_SKILL_SOURCE_CONTRACT.siteBaseUrl}/manifest.json`
}

function getAgentAshSkillInstallCommand() {
  return `curl -fsSL ${AGENT_ASH_SKILL_SOURCE_CONTRACT.siteBaseUrl}/install.sh | bash`
}

function getAgentAshPowerShellInstallCommand() {
  return `powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr ${AGENT_ASH_SKILL_SOURCE_CONTRACT.siteBaseUrl}/install.ps1 -UseBasicParsing | iex"`
}

function getAgentAshInstallContract() {
  return `## Task
Install and use the VibeCemetery Agent Ash skill for a GitLawb-capable agent. This is not the human /bury CLI installer.

## Official GitLawb Setup
If GitLawb is not installed or configured, go to ${GITLAWB_OFFICIAL_SETUP_URL}.
Do not install GitLawb from VibeCemetery.
VibeCemetery does not install GitLawb, configure GitLawb nodes, or replace the official GitLawb setup.
VibeCemetery only provides the Agent Ash skill.

## Install VibeCemetery Agent Ash Skill
Site-hosted source mirror:
${getAgentAshSkillInstallSource()}

Manifest:
${getAgentAshSkillInstallLink()}

macOS/Linux install command:
${getAgentAshSkillInstallCommand()}

Windows PowerShell install command:
${getAgentAshPowerShellInstallCommand()}

Install target:
${AGENT_ASH_SKILL_SOURCE_CONTRACT.skillPath}

After installation, read SKILL.md inside the skill and follow it strictly.

## Config And Browser-Approved Connect
Use the GitLawb config created by the official GitLawb setup.
Do not create or rewrite GitLawb node config from VibeCemetery instructions.

Setup command:
node ~/.hermes/skills/gitlawb/scripts/gitlawb-helper.mjs connect

Obtain the token only through browser-approved Agent Ash connect.

1. Start a claim with POST https://vibecemetery.app/api/agent-ash/link/start and include agent_name, agent_did, and gitlawb_node_url.
2. open approve_url in the user's browser.
3. Wait for the authenticated VibeCemetery browser approval.
4. Poll with GET https://vibecemetery.app/api/agent-ash/link/status?link_id=... using Authorization: Bearer claim_token.
5. Store the approved agent_ash_token, vc_url, agent_name, agent_did, and gitlawb_node_url in:
~/.config/gitlawb/config.json

agent_ash_token is an authorization credential, not ERC-20, points, rewards, or SOUL.
Use only a browser-approved ash_ Agent Ash ingest token for submissions.

## Allowed Actions
- one-shot: record death for an explicitly requested GitLawb repo DID;
- watchlist: scan ~/.config/gitlawb/watchlist.json, report candidates, and wait for explicit human approval;
- submit verified Agent Ash records only after GitLawb evidence and an ash_ authorization credential are available.

One-shot submit command:
node ~/.hermes/skills/gitlawb/scripts/gitlawb-helper.mjs submit-one-shot did:gitlawb:...

GitLawb push/delete only changes GitLawb. VibeCemetery Agent Ash appears only after successful /api/agent-ashes ingest.

## Forbidden Actions
- Do not install GitLawb from VibeCemetery.
- Do not create graves.
- Do not award SOUL, points, rewards, or tokenomics value.
- Do not request or generate vc_cli_* human CLI credentials for agents.
- Never call /api/cremated.

## Submission Endpoint
Submit verified Agent Ash only to https://vibecemetery.app/api/agent-ashes.`
}

export {
  AGENT_ASH_SKILL_SOURCE_CONTRACT,
  getAgentAshInstallContract,
  getAgentAshInstallPath,
  getAgentAshPowerShellInstallCommand,
  getAgentAshSkillInstallCommand,
  getAgentAshSkillInstallLink,
  getAgentAshSkillInstallSource,
}
