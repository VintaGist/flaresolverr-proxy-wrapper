# FlareSolverr Proxy Wrapper

A lightweight HTTP wrapper for FlareSolverr that enables seamless proxy usage with authentication. FlareSolverr natively doesn't support authenticated proxies (username/password), but this wrapper bridges that gap by creating temporary local proxies that handle the authentication.

## 🎯 Problem Solved

FlareSolverr is excellent at bypassing Cloudflare protection, but it only accepts simple HTTP proxies without authentication. Most commercial proxy services require username/password authentication. This wrapper solves that limitation.

## 🚀 How It Works

```
Your App → Wrapper (port 8191) → Temporary HTTP Proxy → FlareSolverr → Authenticated SOCKS/HTTP Proxy → Target Website
```

1. **Receive Request**: Wrapper receives your request with authenticated proxy details
2. **Create Local Proxy**: Dynamically creates a temporary HTTP proxy on localhost that handles authentication
3. **Forward to FlareSolverr**: Sends modified request to FlareSolverr with the temporary proxy
4. **Cleanup**: Automatically cleans up temporary proxies after request completion

## 📋 Features

- ✅ **Proxy Authentication**: Supports SOCKS4/5 and HTTP proxies with username/password
- ✅ **Multiple Concurrent Requests**: Handles up to 20 simultaneous proxy sessions
- ✅ **Automatic Cleanup**: Temporary proxies are cleaned up automatically
- ✅ **Health Monitoring**: Built-in health checks and statistics endpoints
- ✅ **Docker Ready**: Complete Docker Compose setup included
- ✅ **Graceful Timeouts**: Configurable proxy timeouts and graceful connection handling

## 🔧 Quick Start

### Docker Compose (Recommended)

```bash
git clone https://github.com/VintaGist/flaresolverr-proxy-wrapper.git
cd flaresolverr-proxy-wrapper
docker-compose up -d
```

## 📡 Usage

Send POST requests to `http://localhost:8191/v1` with proxy authentication:

```json
{
  "cmd": "request.get",
  "url": "https://example.com",
  "proxy": {
    "url": "socks5://proxy.example.com:1080",
    "username": "your_username",
    "password": "your_password"
  }
}
```

**Without Authentication** (passes through normally):

```json
{
  "cmd": "request.get",
  "url": "https://example.com",
  "proxy": {
    "url": "http://proxy.example.com:8080"
  }
}
```

**No Proxy** (direct connection via FlareSolverr):

```json
{
  "cmd": "request.get",
  "url": "https://example.com"
}
```

## 🛠 API Endpoints

| Endpoint   | Method | Description                      |
| ---------- | ------ | -------------------------------- |
| `/v1`      | POST   | Main FlareSolverr proxy endpoint |
| `/health`  | GET    | Health check and service stats   |
| `/stats`   | GET    | Active proxy statistics          |
| `/cleanup` | POST   | Force cleanup all active proxies |

## ⚙️ Configuration

Environment variables (see `.env.example`):

```bash
WRAPPER_PORT=8191                    # Port for the wrapper service
FLARESOLVERR_URL=http://flaresolverr:8191  # Internal FlareSolverr URL
LOCAL_PROXY_PORT_START=4141          # Starting port for temporary proxies
MAX_CONCURRENT_PROXIES=20            # Maximum concurrent proxy sessions
PROXY_TIMEOUT=120000                 # Proxy timeout in milliseconds
NODE_ENV=production                  # Environment mode
```

## 📊 Monitoring

**Health Check:**

```bash
curl http://localhost:8191/health
```

**Statistics:**

```bash
curl http://localhost:8191/stats
```

**Example Stats Response:**

```json
{
  "activeProxies": 2,
  "availablePorts": 18,
  "proxies": [
    {
      "sessionId": "a1b2c3d4...",
      "port": 4141,
      "upstreamProxy": "socks5://***:***@proxy.example.com:1080",
      "createdAt": "2025-09-07T12:00:00.000Z",
      "ageMs": 15000
    }
  ]
}
```

## 🐳 Docker Architecture

```yaml
services:
  flaresolverr-wrapper: # This service (port 8191)
    ports: ["8191:8191"]

  flaresolverr:# Internal FlareSolverr (not exposed)
    # No external ports
```

## 🚨 Troubleshooting

**"No available ports" error:**

- Increase `MAX_CONCURRENT_PROXIES`
- Check active proxies: `curl http://localhost:8191/stats`
- Force cleanup: `curl -X POST http://localhost:8191/cleanup`

**Timeout errors:**

- Increase `PROXY_TIMEOUT` value
- Verify upstream proxy accessibility
- Check proxy credentials

**Connection refused:**

- Ensure FlareSolverr container is running
- Verify `FLARESOLVERR_URL` configuration
- Check Docker network connectivity

## 📝 Supported Proxy Types

- ✅ HTTP proxies with authentication (tested)
- ✅ HTTPS proxies with authentication (not tested)
- ✅ SOCKS4 proxies with authentication (not tested)
- ✅ SOCKS5 proxies with authentication (tested)
- ✅ Any proxy type supported by proxy-chain

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## Acknowledgments

- [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) - The amazing Cloudflare bypass tool
- [proxy-chain](https://github.com/apify/proxy-chain) - HTTP proxy chaining library

---

**Need help?** Open an issue or check the troubleshooting section above.
