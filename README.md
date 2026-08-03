# <div align="center">🌊 **Flowcase**</div>

<div align="center">

![Flowcase](https://img.shields.io/badge/Status-Development-yellow)
![License](https://img.shields.io/badge/license-MIT-blue)
![Docker](https://img.shields.io/badge/Docker-Required-blue)

**A cutting-edge open-source container streaming platform**

</div>

> [!CAUTION]
> This project is still in development and is not yet ready for production use. We do not currently support upgrading from older versions. Please use with caution.

## What is Flowcase?

**Flowcase** is a free and completely open-source alternative to Kasm Workspaces, enabling secure container streaming for your applications. Stream desktop applications, development environments, and more through your web browser using Docker containers.

## Features

<div align="center">

| Open-Source | Secure Streaming | User-Friendly | Customizable | Multi-Platform |
|:-------------:|:------------------:|:----------------:|:--------------:|:--------------:|
| Completely free and community-driven | Stream applications securely using Docker | Easy to deploy and manage | Supports customization for various use cases | Supports Windows, Linux, and macOS |

</div>

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

5. **Access Flowcase:**
   - Open `http://localhost`
   - Use the default admin credentials shown in the logs

## Prerequisites

Before installing Flowcase, ensure you have:

- **Docker** (version 20.10 or later)
  - [Download Docker Desktop](https://www.docker.com/get-started)
  - Verify: `docker --version`

- **Docker Compose** (version 2.0 or later)
  - Usually included with Docker Desktop
  - Verify: `docker compose version`

- **System Requirements:**
  - At least 2GB RAM
  - 10GB free disk space
  - Network access for downloading images

- **Permissions:**
  - Linux/Mac: User in `docker` group or `sudo` access
  - Windows: Docker Desktop running with WSL2

## Documentation

- **[SETUP.md](SETUP.md)** - Comprehensive setup guide with detailed instructions
  - Configuration options
  - Authentik integration (Advanced)
  - Troubleshooting
  - Production deployment

- **[SECURITY.md](SECURITY.md)** - Security information and reporting

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `PORT` | Web port to expose | `80` | Yes |
| `WEB_CONTAINER_NAME` | Name for the web container | `flowcase-web` | No |
| `NGINX_CONTAINER_NAME` | Name for the nginx container | `flowcase-nginx` | No |
| `FLOWCASE_NETWORK` | Name for the docker network | `flowcase_default_network` | No |
| `FLASK_DEBUG` | Enable debug mode (0/1) | `0` | No |


### Advanced Configuration

If you'd like to integrate Authentik for SSO, or Traefik for reverse proxy and automated SSL, please refer to the advanced setup in [SETUP.md](SETUP.md).

## Accessing Flowcase

1. Navigate to `http://localhost` or your configured server IP
2. Use the default credentials displayed in the terminal logs:
   - Username: `admin`
   - Password: `<random-generated-password>`

## Common Commands

```bash
# Start Flowcase
docker compose up -d

# View logs
docker compose logs -f

# View logs for specific service
docker compose logs -f flowcase

# Stop Flowcase
docker compose down

# Restart services
docker compose restart

# Check service status
docker compose ps
```

## Architecture

Flowcase consists of the following basic components:

- **Flowcase**: Main application server (Flask) + SQLite Database
- **Nginx**: Reverse proxy for Flowcase

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker compose logs

# Check service status
docker compose ps
```

### Can't Access Application

- Ensure containers are running: `docker compose ps`
- Check nginx logs: `docker compose logs nginx`

### Reset Everything

⚠️ **Warning**: This will delete all data!

```bash
docker compose down -v
docker compose up -d
```

For more troubleshooting help, see [SETUP.md](SETUP.md#troubleshooting).

## Contributing

Contributions are welcome! Please feel free to:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

Please read our contributing guidelines and code of conduct before submitting.

## Security

- **Security Issues**: Please report security vulnerabilities to the maintainers privately (see [SECURITY.md](SECURITY.md))
- **Updates**: Keep your installation updated with the latest releases
- **Credentials**: Always use strong, randomly generated passwords

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: Check [SETUP.md](SETUP.md) for detailed guides
- **Issues**: Open an issue on [GitHub](https://github.com/flowcase/flowcase/issues)
- **Discussions**: Join discussions on [GitHub Discussions](https://github.com/flowcase/flowcase/discussions)

---

<div align="center">
Made with ❤️ by the Flowcase Team
</div>
