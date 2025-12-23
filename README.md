# WiredAlter DNS Service

A professional, high-performance DNS lookup tool. Check A, AAAA, MX, NS, and TXT records instantly via browser or CLI.

## Features

* **Real-time Lookups:** Queries the global DNS network directly (no cached stale data).
* **CLI Support:** Native `curl` support for developers.
* **Clean Output:** Returns plain text for CLI and beautiful JSON/HTML for browsers.
* **Privacy First:** Runs entirely in-memory. No logging of user queries.
* **Dockerized:** Ultra-lightweight Alpine container.

## Usage

### Web Interface

Visit [dns.wiredalter.com](https://dns.wiredalter.com) to search for any domain.

### CLI / API Access

Developers can use standard tools to fetch data:

```bash
# Get text report
curl [dns.wiredalter.com/google.com](https://dns.wiredalter.com/google.com)

# Get JSON data
curl [dns.wiredalter.com/api/lookup/google.com](https://dns.wiredalter.com/api/lookup/google.com)
```

## Installation (Self-Hosted)

1. **Clone the repository:**

```bash
git clone [https://github.com/buildplan/dns-service.git](https://github.com/buildplan/dns-service.git)
cd dns-service
```


2. **Run with Docker:**

```bash
docker compose up -d --build
```

The service will be available at `http://localhost:5000`.

## License

This project is licensed under the **MIT License**.
