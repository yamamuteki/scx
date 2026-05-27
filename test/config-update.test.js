import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { runScxAsync } from "./helpers.js";

function apiBody(rate, quote = "JPY") {
  return JSON.stringify({ date: "2026-05-26", base: "USD", quote, rate });
}

function startServer(handler) {
  return new Promise((resolve) => {
    const srv = createServer(handler);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      resolve({ srv, url: `http://127.0.0.1:${port}` });
    });
  });
}

function stopServer(srv) {
  return new Promise((resolve) => srv.close(() => resolve()));
}

function makeXdgConfigHome(config) {
  const dir = mkdtempSync(join(tmpdir(), "scx-test-xdg-"));
  if (config !== undefined) {
    const scxDir = join(dir, "scx");
    mkdirSync(scxDir);
    writeFileSync(join(scxDir, "config.json"), JSON.stringify(config));
  }
  return dir;
}

function makeEmptyXdg() {
  return mkdtempSync(join(tmpdir(), "scx-test-empty-xdg-"));
}

function readXdgConfig(xdg) {
  return JSON.parse(readFileSync(join(xdg, "scx", "config.json"), "utf8"));
}

describe("scx config update", () => {
  test("fetches the rate from the API and writes it to config", async () => {
    const { srv, url } = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(apiBody(155.23));
    });
    try {
      const xdg = makeXdgConfigHome({ currency: "JPY" });
      const { status, stdout } = await runScxAsync(["config", "update"], "", {
        env: { XDG_CONFIG_HOME: xdg, SCX_RATE_FETCH_URL: url },
      });
      assert.equal(status, 0);
      assert.match(stdout, /155\.23/);
      const cfg = readXdgConfig(xdg);
      assert.equal(cfg.rate.value, 155.23);
      assert.equal(cfg.rate.currency, "JPY");
      assert.match(cfg.rate.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
    } finally {
      await stopServer(srv);
    }
  });

  test("uses the default currency when config has none", async () => {
    const { srv, url } = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(apiBody(155));
    });
    try {
      const xdg = makeEmptyXdg();
      const { status } = await runScxAsync(["config", "update"], "", {
        env: { XDG_CONFIG_HOME: xdg, SCX_RATE_FETCH_URL: url },
      });
      assert.equal(status, 0);
      const cfg = readXdgConfig(xdg);
      assert.equal(cfg.currency, "JPY");
      assert.equal(cfg.rate.currency, "JPY");
    } finally {
      await stopServer(srv);
    }
  });

  test("-c <code> overrides currency and updates config.currency too", async () => {
    const { srv, url } = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(apiBody(0.92, "EUR"));
    });
    try {
      const xdg = makeXdgConfigHome({ currency: "JPY" });
      const { status } = await runScxAsync(["config", "update", "-c", "EUR"], "", {
        env: { XDG_CONFIG_HOME: xdg, SCX_RATE_FETCH_URL: url },
      });
      assert.equal(status, 0);
      const cfg = readXdgConfig(xdg);
      assert.equal(cfg.currency, "EUR");
      assert.equal(cfg.rate.currency, "EUR");
      assert.equal(cfg.rate.value, 0.92);
    } finally {
      await stopServer(srv);
    }
  });

  test("requests USD->currency from the configured endpoint", async () => {
    let requestUrl = "";
    const { srv, url } = await startServer((req, res) => {
      requestUrl = req.url;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(apiBody(155));
    });
    try {
      const xdg = makeXdgConfigHome({ currency: "JPY" });
      await runScxAsync(["config", "update"], "", {
        env: { XDG_CONFIG_HOME: xdg, SCX_RATE_FETCH_URL: url },
      });
      assert.match(requestUrl, /\/v2\/rate\/USD\/JPY$/);
    } finally {
      await stopServer(srv);
    }
  });

  test("sends a User-Agent that identifies scx", async () => {
    let userAgent = "";
    const { srv, url } = await startServer((req, res) => {
      userAgent = req.headers["user-agent"] || "";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(apiBody(155));
    });
    try {
      const xdg = makeXdgConfigHome({ currency: "JPY" });
      await runScxAsync(["config", "update"], "", {
        env: { XDG_CONFIG_HOME: xdg, SCX_RATE_FETCH_URL: url },
      });
      assert.match(userAgent, /^scx\//);
    } finally {
      await stopServer(srv);
    }
  });

  test("HTTP 5xx exits 1", async () => {
    const { srv, url } = await startServer((_req, res) => {
      res.writeHead(500);
      res.end("server error");
    });
    try {
      const xdg = makeXdgConfigHome({ currency: "JPY" });
      const { status, stderr } = await runScxAsync(["config", "update"], "", {
        env: { XDG_CONFIG_HOME: xdg, SCX_RATE_FETCH_URL: url },
      });
      assert.equal(status, 1);
      assert.match(stderr, /500|fetch|rate/i);
    } finally {
      await stopServer(srv);
    }
  });

  test("missing rate for the requested currency exits 1", async () => {
    const { srv, url } = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ date: "2026-05-26", base: "USD", quote: "JPY" }));
    });
    try {
      const xdg = makeXdgConfigHome({ currency: "JPY" });
      const { status, stderr } = await runScxAsync(["config", "update"], "", {
        env: { XDG_CONFIG_HOME: xdg, SCX_RATE_FETCH_URL: url },
      });
      assert.equal(status, 1);
      assert.match(stderr, /rate/i);
    } finally {
      await stopServer(srv);
    }
  });

  test("invalid JSON response exits 1", async () => {
    const { srv, url } = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("not json");
    });
    try {
      const xdg = makeXdgConfigHome({ currency: "JPY" });
      const { status, stderr } = await runScxAsync(["config", "update"], "", {
        env: { XDG_CONFIG_HOME: xdg, SCX_RATE_FETCH_URL: url },
      });
      assert.equal(status, 1);
      assert.match(stderr, /JSON/i);
    } finally {
      await stopServer(srv);
    }
  });

  test("does not read stdin", async () => {
    const { srv, url } = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(apiBody(155));
    });
    try {
      const xdg = makeXdgConfigHome({ currency: "JPY" });
      const { status } = await runScxAsync(["config", "update"], "Total: $1.00", {
        env: { XDG_CONFIG_HOME: xdg, SCX_RATE_FETCH_URL: url },
      });
      assert.equal(status, 0);
    } finally {
      await stopServer(srv);
    }
  });

  test("rejects an invalid currency code with -c", async () => {
    const xdg = makeXdgConfigHome({ currency: "JPY" });
    const { status, stderr } = await runScxAsync(["config", "update", "-c", "XYZ"], "", {
      env: { XDG_CONFIG_HOME: xdg, SCX_RATE_FETCH_URL: "http://127.0.0.1:1" },
    });
    assert.equal(status, 1);
    assert.match(stderr, /invalid currency/i);
    assert.match(stderr, /scx config update list/);
  });

  test("fetches a currency v1 never served (VND) via the v2 path", async () => {
    let requestUrl = "";
    const { srv, url } = await startServer((req, res) => {
      requestUrl = req.url;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(apiBody(25400, "VND"));
    });
    try {
      const xdg = makeXdgConfigHome({ currency: "JPY" });
      const { status } = await runScxAsync(["config", "update", "-c", "VND"], "", {
        env: { XDG_CONFIG_HOME: xdg, SCX_RATE_FETCH_URL: url },
      });
      assert.equal(status, 0);
      assert.match(requestUrl, /\/v2\/rate\/USD\/VND$/);
      const cfg = readXdgConfig(xdg);
      assert.equal(cfg.currency, "VND");
      assert.equal(cfg.rate.currency, "VND");
      assert.equal(cfg.rate.value, 25400);
    } finally {
      await stopServer(srv);
    }
  });

  test("fetches another v2-only currency (KWD)", async () => {
    const { srv, url } = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(apiBody(0.307, "KWD"));
    });
    try {
      const xdg = makeEmptyXdg();
      const { status } = await runScxAsync(["config", "update", "-c", "KWD"], "", {
        env: { XDG_CONFIG_HOME: xdg, SCX_RATE_FETCH_URL: url },
      });
      assert.equal(status, 0);
      const cfg = readXdgConfig(xdg);
      assert.equal(cfg.currency, "KWD");
      assert.equal(cfg.rate.currency, "KWD");
      assert.equal(cfg.rate.value, 0.307);
    } finally {
      await stopServer(srv);
    }
  });

  test("config update list prints codes and names from /v2/currencies", async () => {
    let requestUrl = "";
    const { srv, url } = await startServer((req, res) => {
      requestUrl = req.url;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify([
          { iso_code: "EUR", name: "Euro", end_date: "2026-07-26" },
          { iso_code: "JPY", name: "Japanese Yen", end_date: "2026-05-26" },
        ]),
      );
    });
    try {
      const xdg = makeEmptyXdg();
      const { status, stdout } = await runScxAsync(["config", "update", "list"], "", {
        env: { XDG_CONFIG_HOME: xdg, SCX_RATE_FETCH_URL: url },
      });
      assert.equal(status, 0);
      assert.match(requestUrl, /\/v2\/currencies$/);
      assert.match(stdout, /EUR\s+Euro/);
      assert.match(stdout, /JPY\s+Japanese Yen/);
    } finally {
      await stopServer(srv);
    }
  });

  test("config update list does not write the config", async () => {
    const { srv, url } = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify([{ iso_code: "JPY", name: "Japanese Yen" }]));
    });
    try {
      const xdg = makeEmptyXdg();
      const { status } = await runScxAsync(["config", "update", "list"], "", {
        env: { XDG_CONFIG_HOME: xdg, SCX_RATE_FETCH_URL: url },
      });
      assert.equal(status, 0);
      assert.throws(() => readXdgConfig(xdg));
    } finally {
      await stopServer(srv);
    }
  });
});
