export const GITLAWB_OFFICIAL_SETUP_URL = 'https://gitlawb.com/'
export const AGENT_INSTALL_PATH = '/agents/gitlawb'

const AGENT_ASH_SKILL_SOURCE_CONTRACT = {
  repoUrl: 'https://github.com/azkian1/VibeCemetery.git',
  installRef: '5ebae02499c26ab4dcc9ce6dda635bc9474d6b7b',
  skillPath: 'SKILL/skills/gitlawb',
}

function getRepoWebUrl(repoUrl: string) {
  return repoUrl.replace(/\.git$/, '')
}

function getAgentAshInstallPath() {
  return AGENT_INSTALL_PATH
}

function getAgentAshSkillInstallSource() {
  const { repoUrl, installRef, skillPath } = AGENT_ASH_SKILL_SOURCE_CONTRACT
  return `${repoUrl}?ref=${installRef}#${skillPath}`
}

function getAgentAshSkillInstallLink() {
  const { repoUrl, installRef, skillPath } = AGENT_ASH_SKILL_SOURCE_CONTRACT
  return `${getRepoWebUrl(repoUrl)}/tree/${installRef}/${skillPath}`
}

function getAgentAshSkillInstallCommand() {
  return `hermes skills install '${getAgentAshSkillInstallSource()}'`
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
Skill source link:
${getAgentAshSkillInstallLink()}

Source path:
${AGENT_ASH_SKILL_SOURCE_CONTRACT.skillPath}

Pinned source:
${getAgentAshSkillInstallSource()}

Install command:
${getAgentAshSkillInstallCommand()}

Install target:
~/.hermes/skills/gitlawb

After installation, read SKILL.md inside the skill and follow it strictly.

## Config And Browser-Approved Connect
Use the GitLawb config created by the official GitLawb setup.
Do not create or rewrite GitLawb node config from VibeCemetery instructions.

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
  getAgentAshSkillInstallCommand,
  getAgentAshSkillInstallLink,
  getAgentAshSkillInstallSource,
}
