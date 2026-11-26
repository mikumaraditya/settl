import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import app from "../src/app.js";

describe("Express proxy configuration", () => {
  it("trusts exactly the Render reverse-proxy hop", () => {
    assert.equal(app.get("trust proxy"), 1);
  });

  it("resolves the visitor IP from the forwarded header behind one proxy", async () => {
    const response = await request(app)
      .get("/health")
      .set("X-Forwarded-For", "198.51.100.42");

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "ok");
  });
});
