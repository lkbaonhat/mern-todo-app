import nodemailer from 'nodemailer'
import dotenv from 'dotenv'

dotenv.config()

export function smtpOptions(env = process.env) {
    const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM']
    for (const key of required) {
        if (!env[key]?.trim()) throw new Error(`Missing ${key}`)
    }
    const port = Number(env.SMTP_PORT || 587)
    if (![465, 587].includes(port)) throw new Error('SMTP_PORT must be 465 or 587')
    return {
        host: env.SMTP_HOST,
        port,
        secure: port === 465,
        requireTLS: port === 587,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
        tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
        logger: false,
        debug: false
    }
}

export function resetPasswordUrl(token, env = process.env) {
    if (!env.FRONTEND_URL) throw new Error('Missing FRONTEND_URL')
    const base = new URL(env.FRONTEND_URL)
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
        throw new Error('FRONTEND_URL must be an HTTP(S) URL without credentials')
    }
    const url = new URL('/resetPassword', base)
    url.searchParams.set('token', token)
    return url.toString()
}

export function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char])
}

let transport
export function getMailTransport() {
    if (!transport) transport = nodemailer.createTransport(smtpOptions())
    return transport
}

export async function sendMail({ to, subject, text, html }) {
    return getMailTransport().sendMail({
        from: process.env.MAIL_FROM,
        to,
        subject,
        text,
        html,
        disableFileAccess: true,
        disableUrlAccess: true
    })
}
