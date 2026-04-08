import baseConfig from './playwright.config'

const cliConnectConfig = {
  ...baseConfig,
  webServer: undefined,
}

export default cliConnectConfig
