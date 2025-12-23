# WiredAlter DNS Service

A high-performance DNS intelligence API and web service. It provides real-time DNS record lookups (A, MX, NS, TXT, SOA) and propagation checks.

## Features

* **Dual Interface:** Web UI for humans, JSON/Text API for scripts (`curl`/`wget`).
* **Deep Analysis:** instantly resolves A, AAAA, MX, NS, TXT, and SOA records in parallel.
* **Zero caching:** Queries the global DNS network directly to ensure data is always fresh.
* **Privacy First:** Runs entirely in-memory. Zero logging of user queries.
* **Dockerized:** Simple deployment with `docker compose`.

## Usage

### Web Interface
Visit the homepage, [dns.wiredalter.com](https://dns.wiredalter.com) to search for any domain name manually.

### CLI / API Access

Developers can use standard tools to fetch data:

```bash
# Get text report (Automatic CLI detection)
curl dns.wiredalter.com/google.com

# Get full JSON data
curl dns.wiredalter.com/api/lookup/google.com
```

**Example JSON Response:**

```json
{
  "domain": "google.com",
  "timestamp": "2023-10-27T10:00:00.000Z",
  "latency_ms": 45,
  "records": {
    "A": ["142.250.187.206"],
    "AAAA": ["2a00:1450:4009:81e::200e"],
    "MX": [
      { "exchange": "smtp.google.com", "priority": 10 }
    ],
    "NS": ["ns1.google.com", "ns2.google.com"],
    "TXT": ["v=spf1 include:_spf.google.com ~all"]
  }
}
```

## Installation (Self-Hosted)

1. **Clone the repository:**

```bash
git clone https://github.com/buildplan/dns-service.git
cd dns-service
```

2. **Run with Docker:**

**Option 1: Quick Start**: Default Docker compose file in the repo uses pre-built image from our registry `ghcr.io/buildplan/dns-service:latest`.

```bash
docker compose up -d
```

**Option 2: Build from Source**: To build the image locally, edit `docker-compose.yml` to use `build: .` instead of `image: ...`. This is useful if you want to modify the frontend (e.g., branding, colors, or layout).

1. **Customize the UI (Optional):** You can edit `views/index.html` to change the look and feel of the service before building.
2. **Edit `docker-compose.yml`:**

```yaml
services:
  dns-service:
    # Instead of pulling an image, we build from the cloned repo
    build: .
    image: dns-service:local  # Optional: tags the built image locally
    container_name: dns-service
    restart: unless-stopped
    
    # Run as secure non-root user
    user: "node"
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL

    # Map Port 5000 locally
    ports:
      - "127.0.0.1:5000:5000"

    environment:
      - NODE_ENV=production
      - PORT=5000

    deploy:
      resources:
        limits:
          cpus: '0.50'
          memory: 128M
```

Then build and run:

```bash
docker compose up -d --build
```

## License

This project is licensed under the **MIT License**.
