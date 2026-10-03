import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('public/sw.js', 'utf8')
function fixture(network) {
  const listeners = {}
  const stores = new Map()
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async key => stores.delete(key),
    open: async name => {
      if (!stores.has(name)) stores.set(name, new Map())
      const items = stores.get(name)
      const key = req => typeof req === 'string' ? req : req.url
      return {
        match: async req => items.get(key(req)),
        put: async (req, response) => items.set(key(req), response),
        delete: async req => items.delete(key(req)),
        keys: async () => [...items.keys()]
      }
    }
  }
  const self = {
    location: { origin: 'https://example.test' },
    addEventListener: (name, fn) => { listeners[name] = fn },
    skipWaiting() {}, clients: { claim: async () => {} }
  }
  new Function('self', 'caches', 'fetch', 'URL', 'Response', source)(self, caches, (...args) => network(...args), URL, Response)
  return {
    stores,
    fetch(path) {
      let task
      listeners.fetch({ request: { method: 'GET', url: `https://example.test${path}` }, respondWith: promise => { task = promise } })
      return task
    },
    activate() {
      let task
      listeners.activate({ waitUntil: promise => { task = promise } })
      return task
    }
  }
}

describe('PWA authorization boundary', () => {
  it('never caches private lecture content or API responses', async () => {
    let calls = 0
    const state = fixture(async () => { calls++; return new Response('private', { headers: { 'Cache-Control': 'no-store' } }) })
    expect(await (await state.fetch('/lectures/private/index.html')).text()).toBe('private')
    expect(state.stores.get('edumanager-public-lectures-v2').size).toBe(0)
    expect(state.fetch('/api/progress')).toBeUndefined()
    expect(calls).toBe(1)
  })

  it('revalidates public lectures online and permits cached public content offline', async () => {
    let offline = false
    let text = 'v1'
    const state = fixture(async () => {
      if (offline) throw new Error('offline')
      return new Response(text, { headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' } })
    })
    expect(await (await state.fetch('/lectures/welcome/index.html')).text()).toBe('v1')
    text = 'v2'
    expect(await (await state.fetch('/lectures/welcome/index.html')).text()).toBe('v2')
    offline = true
    expect(await (await state.fetch('/lectures/welcome/index.html')).text()).toBe('v2')
    expect((await state.fetch('/lectures/never-opened/index.html')).status).toBe(503)
  })

  it('removes cached public content after access is revoked and does not fall back on 403', async () => {
    let revoked = false
    const state = fixture(async () => revoked ? new Response('denied', { status: 403 }) : new Response('public', { headers: { 'Cache-Control': 'public' } }))
    await state.fetch('/lectures/welcome/index.html')
    revoked = true
    expect((await state.fetch('/lectures/welcome/index.html')).status).toBe(403)
    expect(state.stores.get('edumanager-public-lectures-v2').size).toBe(0)
  })

  it('discards old lecture caches that may include private documents during activation', async () => {
    const state = fixture(async () => new Response(''))
    state.stores.set('edumanager-lectures-v1', new Map([['private', 'old-content']]))
    state.stores.set('unrelated-app', new Map())
    await state.activate()
    expect(state.stores.has('edumanager-lectures-v1')).toBe(false)
    expect(state.stores.has('unrelated-app')).toBe(true)
  })
})
