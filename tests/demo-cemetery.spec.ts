import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'
import { GET as scanGithub } from '../src/app/api/github/scan/route'
import { GET as getGraves, POST as postGrave } from '../src/app/api/graves/route'
import { GET as getCremated, POST as postCremated } from '../src/app/api/cremated/route'
import {
  DEMO_USERNAME,
  createDemoCremation,
  createDemoGrave,
  getDemoDeadRepos,
  getDemoGraves,
  isDemoMode,
  resetDemoCemetery,
} from '../src/demo/cemetery'

test.describe('local demo cemetery data', () => {
  test('is off unless explicitly enabled', () => {
    const previous = process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO
    delete process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO

    expect(isDemoMode()).toBe(false)

    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO
    } else {
      process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO = previous
    }
  })

  test('stays off in production even when the public flag is set', () => {
    const previousDemo = process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO = '1'
    process.env.NODE_ENV = 'production'

    try {
      expect(isDemoMode()).toBe(false)
    } finally {
      if (previousDemo === undefined) {
        delete process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO
      } else {
        process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO = previousDemo
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = previousNodeEnv
      }
    }
  })

  test('provides a populated cemetery and ten dead repos', () => {
    const graves = getDemoGraves()
    const repos = getDemoDeadRepos()

    expect(graves).toHaveLength(28)
    expect(new Set(graves.map((grave) => grave.slot_id)).size).toBe(graves.length)
    expect(graves.every((grave) => grave.author_github === DEMO_USERNAME)).toBe(true)
    expect(repos).toHaveLength(10)
    expect(repos.every((repo) => repo.html_url.startsWith(`https://github.com/${DEMO_USERNAME}/`))).toBe(true)
  })

  test('demo scan returns seeded dead repos without a real GitHub session', async () => {
    const previous = process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO
    process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO = '1'

    try {
      const response = await scanGithub(new NextRequest(`http://localhost/api/github/scan?username=${DEMO_USERNAME}`))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        dead_repos: getDemoDeadRepos(),
        total_repos: getDemoDeadRepos().length,
        dead_count: getDemoDeadRepos().length,
      })
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO
      } else {
        process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO = previous
      }
    }
  })

  test('demo client seeds NextAuth with connected GitHub identity', () => {
    const source = readFileSync('src/components/AppProviders.tsx', 'utf8')

    expect(source).toContain('getDemoSession')
    expect(source).toContain('if (demoSession)')
    expect(source).toContain('session={demoSession}')
    expect(source).toContain('<SessionProvider>{children}</SessionProvider>')
  })

  test('demo cemetery endpoints serve seeded graves and local cremations', async () => {
    const previous = process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO
    process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO = '1'
    resetDemoCemetery()

    try {
      const gravesResponse = await getGraves(new NextRequest('http://localhost/api/graves'))
      const crematedResponse = await getCremated()

      await postCremated(new NextRequest('http://localhost/api/cremated', {
        method: 'POST',
        body: JSON.stringify({ name: 'demo-fire', cause: 'Demo fire', github_url: `https://github.com/${DEMO_USERNAME}/demo-fire` }),
      }))
      const updatedCrematedResponse = await getCremated()

      expect(gravesResponse.status).toBe(200)
      await expect(gravesResponse.json()).resolves.toHaveLength(28)
      expect(crematedResponse.status).toBe(200)
      await expect(crematedResponse.json()).resolves.toEqual([])
      expect(updatedCrematedResponse.status).toBe(200)
      await expect(updatedCrematedResponse.json()).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'demo-fire', author_github: DEMO_USERNAME }),
      ]))
    } finally {
      resetDemoCemetery()
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO
      } else {
        process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO = previous
      }
    }
  })

  test('demo mode accepts SHOVEL burial without real GitHub auth', async () => {
    const previous = process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO
    process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO = '1'
    const repo = getDemoDeadRepos()[0]

    try {
      const response = await postGrave(new NextRequest('http://localhost/api/graves', {
        method: 'POST',
        body: JSON.stringify({
          github_url: repo.html_url,
          github_repo_id: repo.id,
          name: repo.name,
          born_at: repo.created_at,
          died_at: repo.pushed_at,
          cause: 'Buried by demo SHOVEL',
          description: repo.description,
          stack: repo.language ? [repo.language] : [],
        }),
      }))
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.name).toBe(repo.name)
      expect(body.author_github).toBe(DEMO_USERNAME)
      expect(body.github_repo_id).toBe(repo.id)
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO
      } else {
        process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO = previous
      }
    }
  })

  test('demo mode accepts FIRE cremation without real CLI or GitHub auth', async () => {
    const previous = process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO
    process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO = '1'
    const repo = getDemoDeadRepos()[1]

    try {
      const response = await postCremated(new NextRequest('http://localhost/api/cremated', {
        method: 'POST',
        body: JSON.stringify({
          github_url: repo.html_url,
          name: repo.name,
          cause: 'Burned by demo FIRE',
        }),
      }))
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.name).toBe(repo.name)
      expect(body.author_github).toBe(DEMO_USERNAME)
      expect(body.source).toBe('github')
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO
      } else {
        process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO = previous
      }
    }
  })

  test('demo POST shortcuts reject public text that sanitizes to empty', async () => {
    const previous = process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO
    process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO = '1'

    try {
      const graveResponse = await postGrave(new NextRequest('http://localhost/api/graves', {
        method: 'POST',
        body: JSON.stringify({ name: '<script></script>', cause: 'Demo cause', github_repo_id: 1 }),
      }))
      const crematedResponse = await postCremated(new NextRequest('http://localhost/api/cremated', {
        method: 'POST',
        body: JSON.stringify({ name: 'demo-fire', cause: '<script></script>' }),
      }))

      expect(graveResponse.status).toBe(400)
      await expect(graveResponse.json()).resolves.toEqual({ error: 'name and cause are required' })
      expect(crematedResponse.status).toBe(400)
      await expect(crematedResponse.json()).resolves.toEqual({ error: 'name and cause are required' })
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO
      } else {
        process.env.NEXT_PUBLIC_VIBECEMETERY_DEMO = previous
      }
    }
  })

  test('creates synthetic burial and cremation records from selected repos', () => {
    const repo = getDemoDeadRepos()[0]
    const usedSlots = new Set(getDemoGraves().map((grave) => grave.slot_id))

    const grave = createDemoGrave({
      repo,
      cause: 'Demo cause of death',
      usedSlots,
      lastCommitMessage: 'last demo commit',
    })
    const cremation = createDemoCremation({
      repo,
      cause: 'Burned for demo pacing',
      lastCommitMessage: 'last demo commit',
    })

    expect(grave.name).toBe(repo.name)
    expect(grave.cause).toBe('Demo cause of death')
    expect(usedSlots.has(grave.slot_id)).toBe(false)
    expect(grave.github_repo_id).toBe(repo.id)
    expect(cremation.name).toBe(repo.name)
    expect(cremation.author_github).toBe(DEMO_USERNAME)
    expect(cremation.source).toBe('github')
  })
})
