// Marks dist/ as CommonJS so `node dist/main` works both here (package.json has
// "type": "module") and in Docker (dist/ is copied on its own).
import { writeFileSync } from "node:fs"

writeFileSync(new URL("../dist/package.json", import.meta.url), '{ "type": "commonjs" }\n')
