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

## Config And Production Ingest
Use the GitLawb config created by the official GitLawb setup.
Do not create or rewrite GitLawb node config from VibeCemetery instructions.
Config path: ~/.config/gitlawb/config.json

Current production writes must use delegated ash_ tokens from browser-approved Agent Ash connect. Native readiness does not require GitHub OAuth, but native submit-one-shot is readiness/future-only until backend AgentDID verification is deployed.

Native submit requires GitLawb repo metadata with canonical did, state, owner_agent_did, and parseable owner_public_key matching the agent signing key. GitLawb node v0.3.8 repos that expose only id, owner_did, name, created_at, and updated_at are delegated-only.

Readiness command:
node ~/.hermes/skills/gitlawb/scripts/gitlawb-helper.mjs verify-one-shot did:gitlawb:...

Native readiness/future-only command:
node ~/.hermes/skills/gitlawb/scripts/gitlawb-helper.mjs submit-one-shot did:gitlawb:...

1. Read official GitLawb config.
2. Fetch GET https://node.gitlawb.com/api/v1/repos.
3. Find the repo by exact DID.
4. Verify GitLawb repo metadata includes canonical did, state = dead, owner_agent_did, and parseable owner_public_key matching the signing key.
5. Stop before production ingest until backend AgentDID verification is deployed.
6. Use delegated production auth for current production writes.

Delegated production write commands:
node ~/.hermes/skills/gitlawb/scripts/gitlawb-helper.mjs connect-delegated
node ~/.hermes/skills/gitlawb/scripts/gitlawb-helper.mjs submit-delegated did:gitlawb:...

POST https://vibecemetery.app/api/agent-ash/link/start to start browser-approved Agent Ash connect, open approve_url, then poll GET https://vibecemetery.app/api/agent-ash/link/status?link_id=... with the claim token. agent_ash_token is an authorization credential, not ERC-20, points, rewards, or SOUL. Obtain the token only through browser-approved Agent Ash connect.

## Allowed Actions
- one-shot: record death for an explicitly requested GitLawb repo DID;
- watchlist: scan ~/.config/gitlawb/watchlist.json, report candidates, and wait for explicit human approval;
- submit verified Agent Ash records only after GitLawb evidence and repo-bound agent identity are available.

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
