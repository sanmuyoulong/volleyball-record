import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const distRoot = join(projectRoot, "dist");
const clientRoot = join(distRoot, "client");
const serverRoot = join(distRoot, "server");

await rm(distRoot, { recursive: true, force: true });
await mkdir(clientRoot, { recursive: true });
await mkdir(serverRoot, { recursive: true });

for (const file of ["index.html", "styles.css"]) {
  await cp(join(projectRoot, file), join(clientRoot, file));
}
await cp(join(projectRoot, "src"), join(clientRoot, "src"), { recursive: true });
await cp(join(projectRoot, "assets"), join(clientRoot, "assets"), { recursive: true });
await cp(join(projectRoot, "record"), join(clientRoot, "record"), { recursive: true });
await cp(join(projectRoot, "tournaments"), join(clientRoot, "tournaments"), { recursive: true });

const worker = `export default {
  async fetch(request, env) {
    if (!env.ASSETS) {
      return new Response("Static asset binding is unavailable.", { status: 500 });
    }
    const response = await env.ASSETS.fetch(request);
    const url = new URL(request.url);
    if (response.status !== 404 || url.pathname.includes(".")) return response;
    return env.ASSETS.fetch(new Request(new URL("/", url), request));
  }
};
`;

await writeFile(join(serverRoot, "index.js"), worker, "utf8");
console.log("Sites build ready in dist/.");
