# Ryvie rDrive

**English** · [Français](README.fr.md)

> Part of the [Ryvie](https://github.com/ryvieos/Ryvie) ecosystem, the self-hosted personal cloud OS. Learn more at [ryvie.fr](https://ryvie.fr).

<p align="center">
  <img src="rDriveicon.png" alt="rDrive Logo" width="200" style="vertical-align: middle;">
</p>

<p align="center">
  <b>Open-source, self-hosted cloud storage with OnlyOffice support</b><br />
  <i>A Google Drive alternative for your personal cloud, with local and remote access</i>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-installation">Installation</a> •
  <a href="#-configuration">Configuration</a> •
  <a href="#-usage">Usage</a> •
  <a href="#-security">Security</a>
</p>

---

## Overview

### Main interface

<p align="center">
  <img src="screenshots/rdrive-interface.png" alt="rDrive interface" width="800">
  <br>
  <i>File management interface with intuitive navigation</i>
</p>

### OnlyOffice editor

<p align="center">
  <img src="screenshots/onlyoffice-editor.png" alt="OnlyOffice editor" width="800">
  <br>
  <i>Collaborative editing of Excel documents with OnlyOffice</i>
</p>

---

## 🚀 Features

- **📁 File management**: Upload, download, folder organization
- **📝 Collaborative editing**: Integrated OnlyOffice (Word, Excel, PowerPoint)
- **🌐 Hybrid access**: Works on the local network AND remotely via VPN
- **🔄 Synchronization**: File sharing between users
- **🔐 Authentication**: LDAP and OAuth support (Google, Dropbox)
- **📱 Responsive**: Interface adapted to mobile and desktop

## 🏗️ Architecture

### Automatic access mode

rDrive automatically detects the access mode and adapts its configuration:

#### **Local mode** (private network)
```
Client (10.128.255.99)
    ↓
Frontend (10.128.255.101:3010)
    ↓
Backend (10.128.255.101:4000)
    ↓
OnlyOffice (10.128.255.101:8090)
```

#### **Remote mode** (via NetBird VPN)
```
Remote client
    ↓ NetBird VPN
Frontend (100.104.214.194:3010)
    ↓
Backend (100.104.214.194:4000)
    ↓
OnlyOffice (100.104.214.194:8090)
```

### Automatic detection

The frontend detects the origin of the request:
- **Local**: IP `10.x`, `192.168.x`, `172.x`, `localhost`, `ryvie.local`
- **Remote**: Any other IP (e.g. NetBird `100.x`)

URLs are generated dynamically according to the access context.

## 📦 Installation

### Prerequisites

- Docker & Docker Compose
- 4 GB RAM minimum
- 20 GB disk space
- (Optional) NetBird for remote access

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/maisonnavejul/Ryvie-rDrive.git
   cd Ryvie-rDrive/tdrive
   ```

2. **Configure the environment**
   ```bash
   cp .env.example .env
   nano .env
   ```

3. **Start the services**
   ```bash
   docker compose up -d
   ```

4. **Access the application**
   - Local: `http://10.128.255.101:3010`
   - Remote (NetBird): `http://100.104.214.194:3010`

## ⚙️ Configuration

### `.env` file

```bash
# Public URLs (for remote access via NetBird)
REACT_APP_FRONTEND_URL=http://100.104.214.194:3010
REACT_APP_BACKEND_URL=http://100.104.214.194:4000
REACT_APP_WEBSOCKET_URL=ws://100.104.214.194:4000/ws
REACT_APP_ONLYOFFICE_CONNECTOR_URL=http://100.104.214.194:5000
REACT_APP_ONLYOFFICE_DOCUMENT_SERVER_URL=http://100.104.214.194:8090

# Private IP for local detection
REACT_APP_FRONTEND_URL_PRIVATE=10.128.255.101

# Secrets (generate secure random values)
LDAP_BIND_PASSWORD=your_secure_password
DROPBOX_APPKEY=your_dropbox_key
DROPBOX_APPSECRET=your_dropbox_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### OnlyOffice configuration

The OnlyOffice connector is configured in `docker-compose.yml`:

```yaml
onlyoffice-connector:
  environment:
    - CREDENTIALS_ENDPOINT=http://localhost:4000/
    - ONLY_OFFICE_SERVER=http://localhost:8090/
```

These URLs use `localhost` because the connector runs in `network_mode: host`, allowing access to local services even when NetBird is stopped.

## 🎯 Usage

### Local access (without NetBird)

1. Go to `http://10.128.255.101:3010`
2. Log in with your credentials
3. All services work over the local network

### Remote access (with NetBird)

1. Start NetBird: `sudo systemctl start netbird`
2. Go to `http://100.104.214.194:3010`
3. Services are accessible via the VPN

### NetBird management

```bash
# Start NetBird
sudo systemctl start netbird

# Stop NetBird (local access keeps working)
sudo systemctl stop netbird

# Restart NetBird
sudo systemctl restart netbird

# Status
sudo systemctl status netbird
```

## 🔐 Security

### Strengths

✅ **JWT authentication**: Tokens with automatic expiration  
✅ **Token separation**: Distinct access, refresh, and in_page_token  
✅ **No plaintext credentials**: Secure environment variables  
✅ **Automatic CORS**: Origin detection and adapted headers  
✅ **Encrypted VPN**: NetBird for secure remote access  

### Recommendations

⚠️ **Never commit the `.env` file** (already in `.gitignore`)  
⚠️ **Use strong passwords** for LDAP and other services  
⚠️ **Enable HTTPS** in production with Let's Encrypt  
⚠️ **Update regularly** the Docker images  

### HTTPS configuration (Production)

To enable HTTPS with Let's Encrypt:

```bash
# In docker-compose.yml, edit the frontend
environment:
  - SSL_CERTS=on
  - DOMAIN=your-domain.com

# Restart
docker compose restart frontend
```

## 🛠️ Development

### Run the frontend in dev mode

```bash
cd tdrive/frontend
npm install
DISABLE_ESLINT_PLUGIN=true BROWSER=none npm run dev:start
```

The frontend will be available at `http://localhost:3000`

### Rebuild a service

```bash
# Rebuild the frontend
docker compose up -d --build frontend

# Rebuild the OnlyOffice connector
docker compose up -d --build onlyoffice-connector

# Rebuild all services
docker compose up -d --build
```

### Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f frontend
docker compose logs -f node
docker compose logs -f onlyoffice-connector
```

## 🐛 Troubleshooting

### OnlyOffice does not load files

**Symptom**: "Download failed" or "Unable to save"

**Solution**: Check that the connector uses the correct URLs
```bash
docker compose logs onlyoffice-connector | grep "Connector Server URL"
```

### NetBird does not start

**Solution**: Check the status and logs
```bash
sudo systemctl status netbird
sudo journalctl -u netbird -f
```

### Services do not start

**Solution**: Check the dependencies and container health
```bash
docker compose ps
docker compose logs
```

## 📊 Technical Architecture

### Stack

- **Frontend**: React + TypeScript
- **Backend**: Node.js + Express
- **Database**: MongoDB
- **Storage**: Local filesystem (S3 configurable)
- **Editing**: OnlyOffice Document Server
- **Authentication**: JWT + LDAP/OAuth
- **VPN**: NetBird (WireGuard)

### Ports

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3010 | Web interface |
| Backend | 4000 | REST API + WebSocket |
| OnlyOffice Connector | 5000 | OnlyOffice ↔ Backend bridge |
| OnlyOffice Server | 8090 | Document server |
| MongoDB | 27017 | Database |
| RabbitMQ | 5672 | OnlyOffice queue |
| PostgreSQL | 5433 | OnlyOffice DB |

## 📝 License

This project is based on [Twake Drive](https://github.com/linagora/twake-drive) and is distributed under the [AGPL v3](LICENSE) license.

## 🤝 Contributing

Contributions are welcome! Feel free to open an issue or a pull request.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/ryvieos">Ryvie</a>
</p>
