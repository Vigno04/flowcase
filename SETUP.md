# Flowcase Setup Guide

This guide provides detailed instructions for setting up Flowcase.

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Accessing Flowcase](#accessing-flowcase)
- [Troubleshooting](#troubleshooting)

## Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/flowcase/flowcase.git
   cd flowcase
   ```

2. **Create `.env` file:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration if needed
   ```

3. **Start Flowcase:**
   For a production/server deployment (using pre-built image):
   ```bash
   docker compose -f docker-compose.server.yml up -d
   ```
   For local development (builds image from source):
   ```bash
   docker compose up -d
   ```

4. **View logs for credentials:**
   ```bash
   docker compose logs -f flowcase
   ```

## Prerequisites

Before installing Flowcase, ensure you have:

1. **Docker** (version 20.10 or later)
   - Download: https://www.docker.com/get-started
   - Verify: `docker --version`

2. **Docker Compose** (version 2.0 or later)
   - Usually included with Docker Desktop
   - Verify: `docker compose version`

3. **System Requirements:**
   - At least 2GB RAM
   - 10GB free disk space
   - Network access for downloading images

4. **Permissions:**
   - Linux/Mac: User in `docker` group or `sudo` access
   - Windows: Docker Desktop running with WSL2

## Installation

### Step 1: Clone or Download Flowcase

If using git:
```bash
git clone https://github.com/flowcase/flowcase.git
cd flowcase
```

### Step 2: Create Environment File

Create a `.env` file in the Flowcase directory:

```env
# Port to expose Flowcase on
PORT=80

# Custom Container Names (Optional)
WEB_CONTAINER_NAME=flowcase-web
NGINX_CONTAINER_NAME=flowcase-nginx
FLOWCASE_NETWORK=flowcase_default_network

# Enable debug mode (1 for true, 0 for false)
FLASK_DEBUG=0
```

### Step 3: Start Flowcase

For a production/server deployment (using pre-built image):
```bash
docker compose -f docker-compose.server.yml up -d
```

For local development (builds image from source):
```bash
docker compose up -d
```

The `-d` flag runs containers in detached mode (background).

### Step 4: View Logs

```bash
docker compose logs -f flowcase
```

Look for the default admin credentials in the output:
```
Created default users:
-----------------------
Username: admin
Password: <random-password>
-----------------------
```

## Configuration

### Environment Variables

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `PORT` | The port that Nginx binds to | `80` | Yes |
| `WEB_CONTAINER_NAME` | Docker Compose name for web container | `flowcase-web` | No |
| `NGINX_CONTAINER_NAME` | Docker Compose name for Nginx container | `flowcase-nginx` | No |
| `FLOWCASE_NETWORK` | Name of the docker network | `flowcase_default_network` | No |
| `FLASK_DEBUG` | Enables Flask debugging mode (1 for True, 0 for False) | `0` | No |

### Docker Compose Configuration

The main `docker-compose.yml` includes:
- **Flowcase**: Main application server
- **Nginx**: Reverse proxy for Flowcase

## Accessing Flowcase

1. **Access the application:**
   - HTTP: `http://localhost` (or your configured `PORT`)

2. **Default credentials** (displayed in terminal on first startup):
   - Username: `admin`
   - Password: `<random-generated-password>`

## Advanced Integration (Authentik, Traefik)

Flowcase supports reading authentication headers passed down by reverse proxies (like Traefik) and Identity Providers (like Authentik). 
While the default `docker-compose.yml` provides a standalone deployment using a local SQLite database and its own authentication, you can configure your own Traefik + Authentik setup and pass the `--traefik-authentik` flag to `run.py`.

## Troubleshooting

### Container Won't Start

**Check logs:**
```bash
docker compose logs
```

**Common issues:**
- Port conflicts: Check if port 80 is already in use
- Insufficient resources: Ensure Docker has enough RAM/CPU allocated

### Can't Access Application

- Check if containers are running: `docker compose ps`
- Check nginx logs: `docker compose logs nginx`

### Database Connection Issues

Since the default setup uses SQLite, database issues are usually related to file permissions.

**Reset database:**
```bash
docker compose down -v
docker compose up -d
```

⚠️ **Warning**: This will delete all data!

### View Application Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f flowcase
docker compose logs -f nginx
```

### Restart Services

```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart flowcase
docker compose restart nginx
```

### Stop Flowcase

```bash
docker compose down
```

### Remove Everything (Including Data)

```bash
docker compose down -v
```

⚠️ **Warning**: This permanently deletes all data!

## Getting Help

- **Documentation**: Check this guide and README.md
- **Issues**: Open an issue on GitHub
- **Security**: See SECURITY.md for security-related concerns

## Next Steps

After setup:
1. Log in with default admin credentials
2. Create your first droplet/container
3. Configure user permissions
4. Customize settings as needed

Enjoy using Flowcase! 🎉
