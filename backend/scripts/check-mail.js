import { getMailTransport, sendMail } from '../services/mail.js'

let transport
try {
    transport = getMailTransport()
    await transport.verify()
    console.log('SMTP connection, TLS and authentication succeeded.')
    const recipient = process.argv[2]
    if (recipient) {
        await sendMail({
            to: recipient,
            subject: 'MERN Todo SMTP test',
            text: 'The MERN Todo application successfully submitted this message to Mailcow.'
        })
        console.log('Test message accepted by the SMTP server. Check the recipient inbox and Mailcow queue.')
    }
} catch (error) {
    // Report a diagnostic code without printing credentials or the SMTP exchange.
    console.error(`SMTP check failed (${error.code || 'CONFIGURATION_ERROR'}). Check settings, DNS, TLS and mailbox credentials.`)
    process.exitCode = 1
} finally {
    transport?.close()
}
