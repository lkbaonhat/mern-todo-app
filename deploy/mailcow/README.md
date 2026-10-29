# Mailcow SMTP setup for MERN Todo

The backend sends task notifications and password reset messages through an authenticated Mailcow mailbox. Both features use the same SMTP transport. Password reset returns HTTP 503 if Mailcow does not accept the message; task creation still succeeds if its notification fails. Task notifications run in the application process without a durable queue or automatic retry, so an application restart can interrupt delivery. SMTP acceptance does not guarantee final inbox delivery.

## 1. Choose a mail host

Use an existing Mailcow server or a dedicated Linux mail host with a public static IP and a domain you control. Keep Mailcow separate from the existing application host: both stacks use ports 80/443, and Mailcow runs its own web, SMTP, IMAP, antivirus and database services. If the assignment strictly allows only two machines, do not run this installer on either occupied machine; use an existing external Mailcow service or redesign port allocation and the reverse proxy first.

Check the current [Mailcow prerequisites](https://docs.mailcow.email/getstarted/prerequisite-system/) and [installation guide](https://docs.mailcow.email/getstarted/install/) for supported operating systems and sizing. Install Docker Engine 24+, Docker Compose v2, Git, OpenSSL and iproute2 (`ss`) before running the script. Allow enough memory for ClamAV, which remains enabled. The script does not install Docker, change firewall rules, create DNS records or provision a VPS.

Ensure your provider permits inbound and outbound TCP port 25. Submission from the app uses 587/STARTTLS or 465/TLS; those ports do not replace port 25 for server-to-server mail. A provider SMTP relay can be configured in Mailcow when direct outbound delivery is blocked. Configure the host firewall using Mailcow's official guidance because Docker-published ports may bypass ordinary UFW rules.

## 2. Configure DNS before starting Mailcow

For mail domain `example.com` and mail host `mail.example.com`, configure:

| Record | Name | Value |
| --- | --- | --- |
| A | mail.example.com | Public IPv4 address of the mail host |
| MX | example.com | Priority 10, mail.example.com |
| PTR | Public mail IP | mail.example.com, set through your hosting provider |
| TXT / SPF | example.com | A single SPF record authorizing this mail host; for an otherwise unused mail domain: `v=spf1 mx -all` |
| TXT / DKIM | Selector shown by Mailcow | Exact public key generated in Mailcow after adding the domain |
| TXT / DMARC | _dmarc.example.com | Start with `v=DMARC1; p=none`, review authentication results, then tighten the policy |

Merge SPF with existing senders instead of adding a second SPF record. Publish AAAA only if IPv6 routing, firewalling and reverse DNS work. The mail hostname must resolve directly to the mail host; disable HTTP proxying such as Cloudflare's orange-cloud proxy for this hostname. Changing MX records affects incoming mail for the entire domain, so use a separate test domain or subdomain if the domain already has a mail provider.

Follow Mailcow's [DNS documentation](https://docs.mailcow.email/getstarted/prerequisite-dns/) for any additional records. Publish a working address for DMARC reports if you later add a `rua` destination.

## 3. Run the configuration script on the dedicated mail host

Select a supported Mailcow release and copy its full commit SHA from the official repository. The script requires an explicit reviewed commit instead of silently installing a moving branch. It invokes the upstream generator in place and retains Mailcow's interactive platform questions, including IPv6 configuration.

```bash
sudo bash setup-mailcow.sh \
  --hostname mail.example.com \
  --commit REPLACE_WITH_FULL_40_CHARACTER_RELEASE_COMMIT_SHA \
  --timezone Etc/UTC
```

The script checks required tools and listening ports, clones the official repository into `/opt/mailcow-dockerized`, checks out the selected revision, runs `generate_config.sh --dev` to keep that revision, and validates Compose configuration. `mailcow.conf` contains generated secrets and is restricted to root. An existing installation is never overwritten; use Mailcow's documented update/backup procedure for maintenance. If installation fails after cloning, inspect the directory and resolve the cause manually before retrying.

Review `/opt/mailcow-dockerized/mailcow.conf`, DNS, IPv6 and firewall settings, then start the stack:

```bash
cd /opt/mailcow-dockerized
sudo docker compose pull
sudo docker compose up -d
```

Alternatively, pass `--start` to the setup script to pull images and start after configuration. The Mailcow stack is operated separately from Jenkins application releases and has its own image downloads, persistent mail data and backups. It is not included in the application's image archive.

Allow HTTP/HTTPS for the admin UI and ACME certificate issuance, SMTP port 25 for mail exchange, and submission port 587 or 465 from Server 2. Open IMAP and other ports only as required by your mail clients, following Mailcow's networking documentation. Ensure any published IPv6 address has equivalent firewall and DNS configuration.

## 4. Create the sender mailbox and validate TLS

Visit `https://mail.example.com`, complete the official first-login procedure, replace the default administrator credentials immediately, and enable administrator MFA. Add the mail domain, generate/publish DKIM, and create a mailbox such as `notifications@example.com` with a strong unique password. Use the full mailbox address as the SMTP username. `MAIL_FROM` must match the mailbox or a sender address Mailcow explicitly permits; administrator/API credentials do not authenticate SMTP submission.

Wait until Mailcow has a valid certificate for `mail.example.com`. The backend validates hostname and certificate trust and requires TLS; self-signed certificates will fail. Do not bypass TLS verification. For a private CA, mount the CA certificate into the backend and configure Node's `NODE_EXTRA_CA_CERTS` through a separate deployment change.

## 5. Configure the application on Server 2

Edit `/opt/mern-todo/backend.env`, preserving its MongoDB and JWT values:

```dotenv
FRONTEND_URL=https://todo.example.com
SMTP_HOST=mail.example.com
SMTP_PORT=587
SMTP_USER=notifications@example.com
SMTP_PASSWORD=REPLACE_WITH_THE_MAILBOX_PASSWORD
MAIL_FROM="MERN Todo <notifications@example.com>"
```

Use port 465 for implicit TLS if that is the submission port you enabled. Port 587 always requires STARTTLS. Keep the file owned by `deploy` with mode 600; do not commit it or copy it into CI artifacts. Values are read when the backend starts. Redeploy or recreate the backend after an environment change. Existing `GMAIL_USERNAME` and `GMAIL_PASSWORD` settings are no longer used.

Use the public frontend origin for `FRONTEND_URL`; the app generates `/resetPassword?token=...` links from it. Use HTTPS outside local development. Password reset tokens are not written to logs by the controller.

## 6. Verify submission from the running backend

On Server 2, after deploying the new application image:

```bash
cd /opt/mern-todo/releases/$(cat /opt/mern-todo/current)
export IMAGE_TAG=$(cat /opt/mern-todo/current)
docker compose -p mern-todo -f compose.yml exec backend node scripts/check-mail.js
```

The check verifies SMTP connection, TLS and mailbox authentication without sending a message. To explicitly send a test message to an address you control:

```bash
docker compose -p mern-todo -f compose.yml exec backend node scripts/check-mail.js recipient@example.com
```

Check the recipient inbox and spam folder, then inspect SPF, DKIM and DMARC results in the received message headers. If the SMTP server accepts the message but it does not arrive, inspect the Mailcow queue and Postfix logs. For connection failures, check Server 2 egress to the submission port, DNS, certificates and mailbox credentials. The check reports diagnostic codes without printing passwords or the SMTP exchange.

Finally, create a task and request a password reset using an account whose email you control. Confirm the reset link points to your application's frontend. This setup does not send test messages automatically during CI or deployment.
