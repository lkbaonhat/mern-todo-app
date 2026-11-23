import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('application routers are mounted only under /api/v1', async () => {
    const source = await readFile(new URL('../server.js', import.meta.url), 'utf8')
    assert.match(source, /app\.use\("\/api\/v1", v1\)/)
    for (const name of ['user', 'task', 'forgotPassword']) {
        assert.match(source, new RegExp(`v1\\.use\\("/${name}"`))
        assert.doesNotMatch(source, new RegExp(`app\\.use\\("/api/${name}"`))
    }
})

test('health check stays unversioned for Docker and Compose probes', async () => {
    const source = await readFile(new URL('../server.js', import.meta.url), 'utf8')
    assert.match(source, /app\.get\("\/api\/health"/)
})
