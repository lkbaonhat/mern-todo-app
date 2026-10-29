# Two-server CI/CD without an application image registry

Flow: push to `main` -> self-hosted GitHub Actions Runner on Server 1 -> backend syntax checks and two image builds -> `docker save` -> Jenkins agent on Server 1 -> SCP -> `docker load` on Server 2 -> Compose health checks.

Tags use `<commit SHA>-<run ID>-<attempt>`, with a separate directory for each run. Each bundle contains `images.tar`, `compose.yml`, `deploy.sh`, and `SHA256SUMS`. Jenkins deploys the configuration packaged with the images. A successful GitHub Actions run only confirms that Jenkins accepted the request; check Jenkins for the deployment result.

## 1. Server 1 (Ubuntu/Debian, Linux x64)

Install Docker Engine, Docker Compose v2, Node.js 22+, Git, curl, the OpenSSH client, and Jenkins. In the GitHub repository, open Settings -> Actions -> Runners -> New self-hosted runner. Add the `mern-build` label and run the runner as a service. Use this runner only for pushes to main and manual runs on main. Do not add pull request triggers for untrusted sources.

The runner and Jenkins agent must run on Server 1 and access the same artifact directory. If Jenkins runs in a container, bind mount `/opt/ci-artifacts/mern-todo` at the same path with the appropriate read permissions. Configure a Jenkins agent on Server 1 with the `mern-deploy` label instead of using `agent any`.

Set up permissions, replacing `RUNNER_USER` with the actual runner account:

```bash
sudo groupadd -f ci-artifacts
sudo usermod -aG ci-artifacts RUNNER_USER
sudo usermod -aG ci-artifacts jenkins
sudo install -d -o RUNNER_USER -g ci-artifacts -m 2750 /opt/ci-artifacts/mern-todo
sudo usermod -aG docker RUNNER_USER
```

Restart the runner and Jenkins agent services to apply group membership. Jenkins needs SSH/SCP and read access to artifacts; it does not need local Docker access. The runner needs artifact write access, Docker, and Node. Membership in the Docker group grants host administrator privileges.

## 2. Server 2

Install Docker Engine, Docker Compose **v2.20+**, Bash, `flock` from util-linux, sha256sum, and the OpenSSH server. Both servers must use Linux x64; adjust the build target if their architectures differ.

```bash
sudo adduser deploy
sudo usermod -aG docker deploy
sudo install -d -o deploy -g deploy -m 750 /opt/mern-todo /opt/mern-todo/releases
```

Place the dedicated Jenkins public key in `/home/deploy/.ssh/authorized_keys`. Set permissions to 700 for `.ssh` and 600 for `authorized_keys`. Verify that SSH works as `deploy` and Docker does not require an interactive sudo prompt.

Copy `backend.env.example` to `/opt/mern-todo/backend.env`, set `MONGO_URI` and `JWT_SECRET`, and restrict the file to the deploy user with mode 600. MongoDB must be running and reachable from Server 2. The pipeline **does not install MongoDB**, package database data in images, or overwrite the server's environment file.

Allow TCP port 22 from Server 1 to Server 2 and TCP port 80 for users. The backend stays on the Compose network; port 8001 is not exposed on the host. Open `http://SERVER2` to access the application. Nginx forwards `/api` to the backend and supports React Router. Configure HTTPS and a domain with a reverse proxy in front of port 80 if needed.

## 3. Jenkins

Install the Pipeline, SSH Agent, and Credentials Binding plugins. Create these credentials:

| ID | Type | Value |
| --- | --- | --- |
| `mern-server2-ssh` | SSH Username with private key | User `deploy` and the private key matching the public key on Server 2 |
| `mern-known-hosts` | Secret file | A known_hosts file containing the Server 2 host key, with its fingerprint verified through a trusted channel |
| `mern-deploy-host` | Secret text | Server 2 hostname or IPv4 address, without a username, port, or URL |

The pipeline uses SSH port 22 and the deploy user. Keep host key verification enabled. If you collect the key with ssh-keyscan, verify its fingerprint before storing it in Jenkins credentials.

Create a Pipeline job named `mern-todo-deploy`. Select Pipeline script from SCM -> Git -> this repository, branch `main`, and Script Path `Jenkinsfile`. Run the job once to initialize the `IMAGE_TAG` parameter. This initial run may fail validation because no tag is supplied. After initialization, Actions can call buildWithParameters.

Create an API token for a Jenkins user with Build permission on the job. The runner must be able to reach the Jenkins URL. Use a trusted certificate for HTTPS. Modern Jenkins exempts API token authentication from the CSRF crumb requirement. If you receive HTTP 403, check permissions, the reverse proxy, and CSRF configuration instead of disabling CSRF protection.

## 4. GitHub Actions secrets

Open Settings -> Secrets and variables -> Actions and create:

- `JENKINS_JOB_URL`: the full job URL, such as `https://jenkins.example.com/job/mern-todo-deploy`. Jobs inside folders need the full `/job/folder/job/name` path.
- `JENKINS_USER`: the Jenkins username.
- `JENKINS_TOKEN`: that user's API token.

Merge the configuration branch into main after the servers are ready, or select Actions -> Build and hand off to Jenkins -> Run workflow on main. Do not commit credentials or share private keys or tokens in chat.

## 5. Verification and recovery

Confirm that the Transfer and deploy stage succeeds in Jenkins. On Server 2, run:

```bash
cat /opt/mern-todo/current
curl --fail http://localhost/api/health
IMAGE_TAG=$(cat /opt/mern-todo/current) docker compose -p mern-todo -f /opt/mern-todo/releases/$(cat /opt/mern-todo/current)/compose.yml ps
```

The health endpoint returns HTTP 200 when MongoDB is connected and HTTP 503 otherwise. The frontend health check requests the API through Nginx. If Compose does not become healthy before the timeout, the script attempts to restore the previous release. Jenkins still reports failure to flag the failed deployment. The first deployment has no previous release to restore. Container replacement can cause a short interruption; this setup does not provide zero-downtime deployment.

For manual rollback, rerun the Jenkins job with an older tag whose artifacts remain on Server 1, or run `bash /opt/mern-todo/releases/TAG/deploy.sh TAG` on Server 2. Use one Jenkins job to manage this application. The script uses flock to prevent simultaneous container updates. Do not transfer the same tag concurrently.

Schedule artifact and image cleanup after confirming that a new release is stable. Keep at least the current release, the rollback release, and their images on Server 2. Avoid indiscriminate use of `docker system prune -a`. Automatic cleanup is not configured so that rollback artifacts remain available.

## Limitations and testing

The repository does not yet contain an application test suite; backend `npm test` is a placeholder that exits with an error. The workflow checks backend syntax and builds React in Docker. These checks do not replace unit or integration tests. A backend package-lock.json is included, and both Dockerfiles use npm ci to install locked dependencies.

No Docker Hub account or application image push is required. Docker still downloads Node/Nginx base images and npm dependencies during the initial build. Server 2 receives application images in the tar archive.

The existing password reset implementation contains a fixed frontend URL and sender email address. Update those separately before using password reset on a new domain.
