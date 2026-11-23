// Quick end-to-end check of the API. Usage:  npm run smoke
// Target another server with:  API_URL=https://host npm run smoke
import http from "node:http"
import https from "node:https"

const base = new URL(process.env.API_URL || "http://localhost:8080")

// node:http is used because fetch() cannot send a body with GET (removeTask needs one)
function call(method, path, { body, token } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null
        const headers = { "Content-Type": "application/json" }
        if (payload) headers["Content-Length"] = Buffer.byteLength(payload)
        if (token) headers.Authorization = `Bearer ${token}`
        const lib = base.protocol === "https:" ? https : http
        const req = lib.request(
            { hostname: base.hostname, port: base.port || undefined, path, method, headers },
            (res) => {
                let data = ""
                res.on("data", (c) => (data += c))
                res.on("end", () => {
                    let json
                    try { json = JSON.parse(data) } catch { json = data }
                    resolve({ status: res.statusCode, json })
                })
            }
        )
        req.on("error", reject)
        if (payload) req.write(payload)
        req.end()
    })
}

let failed = 0
function check(name, ok, detail) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(detail)}`)
    if (!ok) failed++
}

const email = `smoke-${Date.now()}@example.com`
const password = "Smoke-test-123"

const health = await call("GET", "/api/health")
check("GET  /api/health (db connected)", health.status === 200, health)

const reg = await call("POST", "/api/v1/user/register", { body: { name: "Smoke", email, password } })
check("POST /api/v1/user/register", reg.status === 200 && reg.json.token, reg)

const login = await call("POST", "/api/v1/user/login", { body: { email, password } })
check("POST /api/v1/user/login", login.status === 200 && login.json.token, login)
const token = login.json?.token

const bad = await call("POST", "/api/v1/user/login", { body: { email, password: "wrong" } })
check("POST /api/v1/user/login (wrong password is rejected)", bad.status === 400, bad)

const me = await call("GET", "/api/v1/user/getuser", { token })
check("GET  /api/v1/user/getuser", me.status === 200, me)

const noAuth = await call("GET", "/api/v1/task/getTask")
check("GET  /api/v1/task/getTask (no token is rejected)", noAuth.status === 401, noAuth)

const add = await call("POST", "/api/v1/task/addTask", { token, body: { title: "smoke task", description: "created by smoke test" } })
check("POST /api/v1/task/addTask", add.status === 200, add)

const list = await call("GET", "/api/v1/task/getTask", { token })
check("GET  /api/v1/task/getTask", list.status === 200 && list.json.length === 1, list)

const del = await call("GET", "/api/v1/task/removeTask", { token, body: { id: list.json?.[0]?._id } })
check("GET  /api/v1/task/removeTask", del.status === 200, del)

const old = await call("POST", "/api/user/login", { body: { email, password } })
check("POST /api/user/login (old unversioned path is gone)", old.status === 404, old)

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed")
process.exit(failed ? 1 : 0)
