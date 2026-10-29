import test from 'node:test'
import assert from 'node:assert/strict'
import { smtpOptions, resetPasswordUrl, escapeHtml } from '../services/mail.js'

const env = {
    SMTP_HOST: 'mail.example.com', SMTP_USER: 'notifications@example.com',
    SMTP_PASSWORD: 'test-only', MAIL_FROM: 'notifications@example.com',
    FRONTEND_URL: 'https://todo.example.com'
}

test('SMTP enforces authenticated TLS for submission ports', () => {
    const starttls = smtpOptions(env)
    assert.equal(starttls.port, 587)
    assert.equal(starttls.secure, false)
    assert.equal(starttls.requireTLS, true)
    assert.equal(starttls.tls.rejectUnauthorized, true)
    const implicit = smtpOptions({ ...env, SMTP_PORT: '465' })
    assert.equal(implicit.secure, true)
    assert.equal(implicit.requireTLS, false)
    assert.throws(() => smtpOptions({ ...env, SMTP_PORT: '25' }))
    assert.throws(() => smtpOptions({ ...env, SMTP_PASSWORD: '' }))
})

test('reset links use the configured origin and encode the token', () => {
    const url = new URL(resetPasswordUrl('a&b', env))
    assert.equal(url.origin, env.FRONTEND_URL)
    assert.equal(url.pathname, '/resetPassword')
    assert.equal(url.searchParams.get('token'), 'a&b')
    assert.throws(() => resetPasswordUrl('token', {}))
    assert.throws(() => resetPasswordUrl('token', { FRONTEND_URL: 'javascript:alert(1)' }))
})

test('email HTML escapes task content and URL attribute delimiters', () => {
    assert.equal(escapeHtml('<script>"&\'</script>'), '&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;')
})
