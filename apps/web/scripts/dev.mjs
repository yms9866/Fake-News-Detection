import { createServer } from "vite";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const server = await createServer({
  configFile: join(root, "vite.config.ts"),
  root
});
await server.listen();
server.printUrls();
