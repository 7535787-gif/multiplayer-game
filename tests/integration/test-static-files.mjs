import test from "node:test";
import assert from "node:assert/strict";

const port = process.env.TEST_PORT ?? "3000";
const baseUrl = `http://127.0.0.1:${port}`;

test("Compiled server serves the built client entry point and assets", async () => {
  const pageResponse = await fetch(`${baseUrl}/`);
  assert.equal(pageResponse.status, 200);
  assert.match(pageResponse.headers.get("content-type") ?? "", /text\/html/);

  const html = await pageResponse.text();
  const scriptPath = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
  assert.ok(scriptPath, "Built index.html should reference a JavaScript bundle");

  const scriptResponse = await fetch(new URL(scriptPath, baseUrl));
  assert.equal(scriptResponse.status, 200);
  assert.match(scriptResponse.headers.get("content-type") ?? "", /javascript/);
});
