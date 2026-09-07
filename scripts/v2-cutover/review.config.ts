import { defineConfig } from '@playwright/test'
import { realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import browserConfig from '../../playwright.web3.config'

const repo = realpathSync(resolve(__dirname, '../..'))
const input = process.env.CUTOVER_REVIEW_DIR
if (!input || !isAbsolute(input)) throw new Error('Set CUTOVER_REVIEW_DIR to the private rehearsal directory')
const privateRoot = realpathSync(input)
const server = browserConfig.webServer
if (!server || Array.isArray(server)) throw new Error('Expected the isolated browser test server')
const fromRepo = relative(repo, privateRoot)
if (!fromRepo || (!fromRepo.startsWith('..') && !isAbsolute(fromRepo))) {
  throw new Error('Review inputs and screenshots must stay outside the repository')
}

export default defineConfig({
  ...browserConfig,
  testDir: __dirname,
  testMatch: 'review.spec.ts',
  outputDir: join(privateRoot, 'browser-review'),
  webServer: { ...server, cwd: repo },
})
