const express = require("express");
const proxyChain = require("proxy-chain");
const fetch = require("node-fetch");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "50mb" }));

const WRAPPER_PORT = process.env.WRAPPER_PORT || 8191;
const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || "http://flaresolverr:8191";
const LOCAL_PROXY_PORT_START = parseInt(process.env.LOCAL_PROXY_PORT_START) || 4141;
const MAX_CONCURRENT_PROXIES = parseInt(process.env.MAX_CONCURRENT_PROXIES) || 20;
const PROXY_TIMEOUT = parseInt(process.env.PROXY_TIMEOUT) || 120000; // 2 хвилини

class ProxyManager {
  constructor() {
    this.activeProxies = new Map(); // sessionId -> {port, anonymizedUrl, cleanup}
    this.portPool = [];
    this.initPortPool();
  }

  initPortPool() {
    for (let i = 0; i < MAX_CONCURRENT_PROXIES; i++) {
      this.portPool.push(LOCAL_PROXY_PORT_START + i);
    }
  }

  generateSessionId() {
    return crypto.randomBytes(16).toString("hex");
  }

  getAvailablePort() {
    return this.portPool.pop();
  }

  releasePort(port) {
    this.portPool.push(port);
  }

  async createLocalProxy(upstreamProxyUrl) {
    const port = this.getAvailablePort();
    if (!port) {
      throw new Error("No available ports for proxy creation");
    }

    try {
      console.log(`Creating local proxy on port ${port} for upstream: ${upstreamProxyUrl.replace(/:.*@/, ":***@")}`);

      const server = new proxyChain.Server({
        port: port,
        host: "0.0.0.0",
        prepareRequestFunction: () => ({
          upstreamProxyUrl: upstreamProxyUrl,
        }),
        verbose: process.env.NODE_ENV === "development",
      });

      await server.listen();

      const sessionId = this.generateSessionId();
      const localProxyUrl = `http://flaresolverr-wrapper:${port}`; 

      // Auto-cleanup через timeout
      const timeoutId = setTimeout(() => {
        console.log(`Auto-cleanup proxy ${sessionId} after timeout`);
        this.cleanup(sessionId);
      }, PROXY_TIMEOUT);

      this.activeProxies.set(sessionId, {
        port,
        server,
        localProxyUrl,
        upstreamProxyUrl,
        createdAt: Date.now(),
        timeoutId,
        cleanup: () => {
          clearTimeout(timeoutId);
          server.close();
          this.releasePort(port);
        },
      });

      console.log(`Local proxy created: ${sessionId} -> ${localProxyUrl}`);
      return { sessionId, localProxyUrl };
    } catch (error) {
      this.releasePort(port);
      throw error;
    }
  }

  cleanup(sessionId) {
    const proxy = this.activeProxies.get(sessionId);
    if (proxy) {
      console.log(`Cleaning up proxy ${sessionId} (port ${proxy.port})`);
      proxy.cleanup();
      this.activeProxies.delete(sessionId);
    }
  }

  getStats() {
    return {
      activeProxies: this.activeProxies.size,
      availablePorts: this.portPool.length,
      proxies: Array.from(this.activeProxies.entries()).map(([id, proxy]) => ({
        sessionId: id,
        port: proxy.port,
        upstreamProxy: proxy.upstreamProxyUrl.replace(/:.*@/, ":***@"),
        createdAt: new Date(proxy.createdAt).toISOString(),
        ageMs: Date.now() - proxy.createdAt,
      })),
    };
  }
}

const proxyManager = new ProxyManager();

// Middleware для логування
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} ${req.method} ${req.path}`);
  next();
});

// Головний endpoint - проксі до FlareSolverr
app.post("/v1", async (req, res) => {
  let sessionId = null;

  try {
    const originalBody = req.body;
    console.log(`Processing FlareSolverr request: ${originalBody.cmd}`);

    // Перевіряємо чи є proxy в запиті
    if (originalBody.proxy && originalBody.proxy.url) {
      const { url: proxyUrl, username, password } = originalBody.proxy;

      // Формуємо повний URL з auth
      let upstreamProxyUrl;
      if (username && password) {
        const urlParts = proxyUrl.replace(/^(https?|socks[45]?):\/\//, "");
        const protocol = proxyUrl.match(/^(https?|socks[45]?):/)[1];
        upstreamProxyUrl = `${protocol}://${username}:${password}@${urlParts}`;
      } else {
        upstreamProxyUrl = proxyUrl;
      }

      // Створюємо локальний проксі
      const { sessionId: newSessionId, localProxyUrl } = await proxyManager.createLocalProxy(upstreamProxyUrl);
      sessionId = newSessionId;

      // Модифікуємо запит для FlareSolverr
      const modifiedBody = {
        ...originalBody,
        proxy: {
          url: localProxyUrl,
        },
      };

      console.log(`Forwarding to FlareSolverr with local proxy: ${localProxyUrl}`);

      // Відправляємо запит до справжнього FlareSolverr
      const flareResponse = await fetch(`${FLARESOLVERR_URL}/v1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(modifiedBody),
        timeout: PROXY_TIMEOUT - 10000, // менше ніж proxy timeout
      });

      const flareResult = await flareResponse.json();
      res.json(flareResult);
    } else {
      console.log(`Forwarding to FlareSolverr without proxy`);

      const flareResponse = await fetch(`${FLARESOLVERR_URL}/v1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(originalBody),
      });

      const flareResult = await flareResponse.json();
      res.json(flareResult);
    }
  } catch (error) {
    console.error(`Error processing request:`, error.message);
    res.status(500).json({
      solution: null,
      status: "error",
      message: `Wrapper error: ${error.message}`,
      startTimestamp: Date.now(),
      endTimestamp: Date.now(),
    });
  } finally {
    if (sessionId) {
      setTimeout(() => {
        proxyManager.cleanup(sessionId);
      }, 2000); // 2 sec delay
    }
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "flaresolverr-wrapper",
    timestamp: new Date().toISOString(),
    stats: proxyManager.getStats(),
  });
});

// Stats endpoint
app.get("/stats", (req, res) => {
  res.json(proxyManager.getStats());
});

// Cleanup endpoint для форс-очищення всіх проксі
app.post("/cleanup", (req, res) => {
  const stats = proxyManager.getStats();
  stats.proxies.forEach((proxy) => {
    proxyManager.cleanup(proxy.sessionId);
  });

  res.json({
    message: "All proxies cleaned up",
    cleaned: stats.activeProxies,
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down wrapper...");
  const stats = proxyManager.getStats();
  stats.proxies.forEach((proxy) => {
    proxyManager.cleanup(proxy.sessionId);
  });
  process.exit(0);
});

// Start server
app.listen(WRAPPER_PORT, "0.0.0.0", () => {
  console.log(`FlareSolverr Wrapper running on port ${WRAPPER_PORT}`);
  console.log(`Upstream FlareSolverr: ${FLARESOLVERR_URL}`);
  console.log(
    `Local proxy port range: ${LOCAL_PROXY_PORT_START}-${LOCAL_PROXY_PORT_START + MAX_CONCURRENT_PROXIES - 1}`
  );
  console.log(`Proxy timeout: ${PROXY_TIMEOUT}ms`);
});
