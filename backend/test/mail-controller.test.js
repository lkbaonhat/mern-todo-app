import test from 'node:test'
import assert from 'node:assert/strict'
import nodemailer from 'nodemailer'
import userModel from '../models/userModel.js'
import taskModel from '../models/taskModel.js'
import { forgotPassword } from '../controllers/forgotPasswordController.js'
import { addTask } from '../controllers/taskController.js'

Object.assign(process.env, {
    SMTP_HOST: 'mail.example.com', SMTP_PORT: '587', SMTP_USER: 'notifications@example.com',
    SMTP_PASSWORD: 'test-only', MAIL_FROM: 'notifications@example.com', FRONTEND_URL: 'https://todo.example.com'
})
const response = () => ({
    code: 200, data: null,
    status(code) { this.code = code; return this },
    json(data) { this.data = data; return this }
})

test('controllers submit reset and task emails and handle SMTP failure', async t => {
    const messages = []
    let reject = false
    t.mock.method(nodemailer, 'createTransport', () => ({
        async sendMail(message) {
            messages.push(message)
            if (reject) throw new Error('simulated SMTP failure')
            return { accepted: [message.to] }
        }
    }))
    t.mock.method(console, 'error', () => {})
    const user = { email: 'recipient@example.com', async save() {} }
    t.mock.method(userModel, 'findOne', async () => user)
    let result = response()
    let forwarded
    await forgotPassword({ body: { email: user.email } }, result, error => { forwarded = error })
    assert.equal(forwarded, undefined)
    assert.equal(result.code, 200)
    assert.match(messages[0].text, /https:\/\/todo.example.com\/resetPassword\?token=/)
    assert.equal(messages[0].from, process.env.MAIL_FROM)
    reject = true
    result = response()
    await forgotPassword({ body: { email: user.email } }, result, error => { forwarded = error })
    assert.equal(result.code, 503)
    assert.doesNotMatch(JSON.stringify(result.data), /test-only|simulated SMTP failure/)
    t.mock.method(userModel, 'find', async () => [user])
    t.mock.method(taskModel.prototype, 'save', async () => ({}))
    result = response()
    await addTask({ body: { title: '<b>Task</b>', description: 'Description' }, user: { id: '507f1f77bcf86cd799439011' } }, result)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(result.code, 200)
    assert.equal(result.data.message, 'Task added successfully')
    assert.match(messages.at(-1).html, /&lt;b&gt;Task&lt;\/b&gt;/)
})
