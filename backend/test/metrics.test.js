import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { configureMetrics } from '../metrics.js'

test('metrics expose bounded request labels, latency and database readiness', async () => {
    const app = express()
    let state = 1
    const registry = configureMetrics(app, () => state)
    const router = express.Router()
    router.get('/:id', (req, res) => res.status(503).send('unavailable'))
    app.use('/api/items', router)
    app.get('/api/health', (req, res) => res.send('ok'))
    const server = app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    try {
        await fetch(`${base}/api/items/private-id?token=secret`)
        await fetch(`${base}/unknown-private-id`)
        await fetch(`${base}/api/health`)
        const response = await fetch(`${base}/metrics`)
        assert.equal(response.status, 200)
        assert.match(response.headers.get('content-type'), /text\/plain/)
        const metrics = await response.text()
        assert.match(metrics, /http_requests_total\{[^\n]*route="\/api\/items\/:id"[^\n]*status_code="503"[^\n]*\} 1/)
        assert.match(metrics, /route="unmatched"/)
        assert.match(metrics, /http_request_duration_seconds_bucket/)
        assert.match(metrics, /process_resident_memory_bytes/)
        assert.match(metrics, /mongodb_connected\{[^\n]*\} 1/)
        assert.doesNotMatch(metrics, /private-id|token=|route="\/metrics"|route="\/api\/health"/)
        state = 0
        assert.match(await (await fetch(`${base}/metrics`)).text(), /mongodb_connected\{[^\n]*\} 0/)
    } finally {
        registry.clear()
        await new Promise(resolve => server.close(resolve))
    }
})
