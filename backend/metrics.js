import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from "prom-client"

export function configureMetrics(app, mongoReadyState) {
    const registry = new Registry()
    registry.setDefaultLabels({ app: "mern-todo" })
    collectDefaultMetrics({ register: registry })
    const requests = new Counter({
        name: "http_requests_total",
        help: "Completed application HTTP requests, excluding metrics and health probes",
        labelNames: ["method", "route", "status_code"],
        registers: [registry]
    })
    const duration = new Histogram({
        name: "http_request_duration_seconds",
        help: "Application HTTP request duration in seconds",
        labelNames: ["method", "route", "status_code"],
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
        registers: [registry]
    })
    new Gauge({
        name: "mongodb_connected",
        help: "Whether the application MongoDB connection is ready (1 or 0)",
        registers: [registry],
        collect() { this.set(mongoReadyState() === 1 ? 1 : 0) }
    })
    app.use((req, res, next) => {
        if (req.path === "/metrics" || req.path === "/api/health") return next()
        const end = duration.startTimer()
        res.on("finish", () => {
            // Route templates prevent user IDs, tokens, and query strings from becoming labels.
            const route = req.route ? `${req.baseUrl}${req.route.path}` : "unmatched"
            const method = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(req.method) ? req.method : "OTHER"
            const labels = { method, route, status_code: String(res.statusCode) }
            requests.inc(labels)
            end(labels)
        })
        next()
    })
    // This endpoint is reachable only on the internal Compose network.
    app.get("/metrics", async (req, res, next) => {
        try {
            res.set("Content-Type", registry.contentType).send(await registry.metrics())
        } catch (error) { next(error) }
    })
    return registry
}
