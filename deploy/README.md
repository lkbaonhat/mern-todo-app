# CI/CD hai server, không dùng registry cho image ứng dụng

Luồng: push `main` → self-hosted GitHub Actions Runner (Server 1) → kiểm tra cú pháp backend, build hai image → `docker save` → Jenkins (agent trên Server 1) → SCP → Server 2 `docker load` → Compose health check.

Tag có dạng `<commit SHA>-<run ID>-<attempt>`; mỗi lần chạy có thư mục riêng. Gói gồm `images.tar`, `compose.yml`, `deploy.sh`, `SHA256SUMS`. Jenkins deploy đúng cấu hình đi kèm image, không checkout bản mới nhất rồi trộn phiên bản. GitHub Actions thành công chỉ xác nhận Jenkins đã nhận yêu cầu; kết quả deploy xem trong Jenkins.

## 1. Server 1 (Ubuntu/Debian, Linux x64)

Cài Docker Engine, Docker Compose v2, Node.js 22+, Git, curl, OpenSSH client và Jenkins. Tạo runner từ GitHub repo → Settings → Actions → Runners → New self-hosted runner. Thêm label `mern-build`, chạy runner bằng service. Chỉ workflow push main và manual trên main được dùng runner này; không thêm trigger PR từ nguồn không tin cậy.

Runner và Jenkins agent cần chạy trên cùng Server 1 và truy cập cùng thư mục artifact. Nếu Jenkins chạy trong container, bind mount `/opt/ci-artifacts/mern-todo` với đúng đường dẫn và quyền đọc tương ứng. Tạo agent label `mern-deploy` trên Server 1 (không dùng `agent any`).

Ví dụ chuẩn bị quyền, thay `RUNNER_USER` bằng user thật của runner:

```bash
sudo groupadd -f ci-artifacts
sudo usermod -aG ci-artifacts RUNNER_USER
sudo usermod -aG ci-artifacts jenkins
sudo install -d -o RUNNER_USER -g ci-artifacts -m 2750 /opt/ci-artifacts/mern-todo
sudo usermod -aG docker RUNNER_USER
```

Khởi động lại service runner/Jenkins agent để nhận group mới. Jenkins chỉ cần SSH/SCP và đọc artifact; không cần Docker local. Runner cần ghi artifact, Docker và Node. Quyền nhóm Docker tương đương quyền quản trị host.

## 2. Server 2

Cài Docker Engine, Docker Compose **v2.20+**, Bash, `flock` (util-linux), sha256sum và OpenSSH server. Hai server cần cùng kiến trúc Linux x64; nếu khác kiến trúc phải đổi build sang target phù hợp.

```bash
sudo adduser deploy
sudo usermod -aG docker deploy
sudo install -d -o deploy -g deploy -m 750 /opt/mern-todo /opt/mern-todo/releases
```

Đặt public key dành riêng cho Jenkins trong `/home/deploy/.ssh/authorized_keys`; bảo đảm quyền `.ssh` là 700, `authorized_keys` là 600. Kiểm tra SSH hoạt động dưới user `deploy`, không cần sudo tương tác khi gọi Docker.

Sao chép `backend.env.example` thành `/opt/mern-todo/backend.env`, điền `MONGO_URI`, `JWT_SECRET` và quyền 600 cho user deploy. MongoDB phải sẵn sàng và Server 2 truy cập được. Pipeline **không cài MongoDB**, không chuyển dữ liệu DB trong image và không ghi đè file env trên server.

Mở TCP 22 từ Server 1 đến Server 2 và TCP 80 cho người dùng. Backend chỉ ở mạng Compose, không mở cổng 8001 ra host. Truy cập web qua `http://SERVER2`; Nginx chuyển `/api` đến backend và hỗ trợ React Router. HTTPS/domain có thể cấu hình thêm ở reverse proxy trước cổng 80.

## 3. Jenkins

Cài các plugin Pipeline, SSH Agent và Credentials Binding. Tạo credentials:

| ID | Loại | Giá trị |
| --- | --- | --- |
| `mern-server2-ssh` | SSH Username with private key | User `deploy`, private key tương ứng trên Server 2 |
| `mern-known-hosts` | Secret file | File known_hosts chứa host key Server 2 đã xác minh fingerprint qua kênh tin cậy |
| `mern-deploy-host` | Secret text | Hostname hoặc IPv4 Server 2; không có user, port hoặc URL |

Pipeline hiện dùng SSH port 22 và user deploy. Không tắt kiểm tra host key; nếu dùng ssh-keyscan để thu key, phải xác minh fingerprint trước khi đưa vào credentials.

Tạo job Pipeline tên `mern-todo-deploy`, chọn Pipeline script from SCM → Git → repo này, branch `main`, Script Path `Jenkinsfile`. Chạy job lần đầu để Jenkins tạo parameter `IMAGE_TAG`; có thể fail ở bước validate vì chưa có tag, đây là bước khởi tạo job. Sau đó Actions mới gọi buildWithParameters được.

Tạo API token cho user Jenkins có quyền Build trên job. Jenkins URL phải truy cập được từ runner. Với HTTPS, dùng chứng chỉ được tin cậy. Jenkins hiện đại cho phép token API được miễn CSRF crumb; nếu cấu hình trả 403, kiểm tra quyền, reverse proxy và CSRF, không tắt CSRF để chữa lỗi.

## 4. GitHub Actions secrets

Vào Settings → Secrets and variables → Actions, tạo:

- `JENKINS_JOB_URL`: URL đầy đủ của job, ví dụ `https://jenkins.example.com/job/mern-todo-deploy` (job trong folder cần đủ `/job/folder/job/name`).
- `JENKINS_USER`: user Jenkins.
- `JENKINS_TOKEN`: API token của user đó.

Merge nhánh cấu hình vào main sau khi server đã sẵn sàng, hoặc chọn Actions → Build and hand off to Jenkins → Run workflow trên main. Không ghi credentials vào repo hoặc gửi private key/token vào chat.

## 5. Xác nhận và khôi phục

Trong Jenkins, kiểm tra Transfer and deploy thành công. Trên Server 2:

```bash
cat /opt/mern-todo/current
curl --fail http://localhost/api/health
IMAGE_TAG=$(cat /opt/mern-todo/current) docker compose -p mern-todo -f /opt/mern-todo/releases/$(cat /opt/mern-todo/current)/compose.yml ps
```

Health endpoint trả 200 khi MongoDB connected, 503 khi chưa sẵn sàng. Frontend health check kiểm tra API qua Nginx. Nếu Compose không healthy trong thời hạn, script thử chạy lại release trước và Jenkins vẫn báo failure để thấy lần deploy mới bị lỗi. Lần deploy đầu chưa có release trước để rollback. Cập nhật này có thể gián đoạn ngắn khi thay container; không phải zero-downtime.

Rollback thủ công: chạy lại job Jenkins với tag cũ còn đủ artifact trên Server 1, hoặc trên Server 2 chạy `bash /opt/mern-todo/releases/TAG/deploy.sh TAG`. Chỉ chạy một Jenkins job quản lý app; script dùng flock để tránh hai lần cập nhật container đồng thời. Không chạy lại cùng tag đồng thời khi đang chuyển file.

Dọn artifact/image theo lịch sau khi xác nhận release mới ổn định. Giữ ít nhất release hiện tại và bản rollback cùng image của chúng trên Server 2. Không dùng `docker system prune -a` tùy tiện. Chưa tự động xóa để tránh mất bản cần rollback.

## Giới hạn và kiểm thử

Repo chưa có bộ test ứng dụng; backend `npm test` hiện chỉ là placeholder báo lỗi. Workflow kiểm tra cú pháp backend và build React trong Docker, chưa thay thế unit/integration test. Đã bổ sung backend package-lock.json; cả hai Dockerfile dùng npm ci để cài theo lockfile.

Không cần tài khoản Docker Hub hoặc push image ứng dụng lên registry. Docker vẫn cần tải base image Node/Nginx và npm dependencies trong lần build đầu. Server 2 nhận image qua tar, không pull image ứng dụng.

Chức năng quên mật khẩu trong code gốc vẫn chứa URL frontend và địa chỉ gửi mail cố định; cần chỉnh riêng trước khi dùng chức năng đó trên domain mới.
