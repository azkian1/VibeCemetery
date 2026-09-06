import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { GET } from '../src/app/skills/bury/v1/[...path]/route'

test('legacy install page redirects to agent instructions', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/skills/bury/v1/page.tsx'), 'utf8')
  expect(source).toContain("permanentRedirect('/agent-instructions')")
  expect(source).not.toContain('Install commands')
})

test('Next tracing includes the temporary helper without distributing the old installer', () => {
  const source = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')
  expect(source).toContain("'/agent-instructions/helper.mjs'")
  expect(source).toContain("'./src/agent/burial-helper.mjs'")
  expect(source).not.toContain('/skills/bury/v1/')
  expect(source).not.toContain("'./SKILL/**/*'")
})

test('retired distribution fails with plain-text guidance instead of executable files or redirects', async () => {
  const response = await GET()
  const text = await response.text()
  expect(response.status).toBe(410)
  expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('location')).toBeNull()
  expect(text).toContain('https://vibecemetery.app/agent-instructions')
  expect(text).not.toContain('<html')
  expect(text).not.toContain('install.sh')
})
