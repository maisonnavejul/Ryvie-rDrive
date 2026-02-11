#!/bin/bash
set -euo pipefail

# Script d'installation de Ryvie-rDrive
# Génère le fichier .env et configure l'application

NETBIRD_INTERFACE="wt0"
RDRIVE_DIR="/data/apps/rdrive"
LDAP_DIR="/data/config/ldap"
LOG_FILE="/data/logs/install-rdrive-$(date +%Y%m%d-%H%M%S).log"

# Créer les dossiers nécessaires
mkdir -p /data/logs
mkdir -p "$RDRIVE_DIR"
mkdir -p "$LDAP_DIR"

# Fonction de logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "═══════════════════════════════════════════════════════════════"
log "🚀 INSTALLATION DE RYVIE-RDRIVE"
log "═══════════════════════════════════════════════════════════════"

# Fonction pour récupérer l'IP d'une interface réseau
get_interface_ip() {
    local interface="$1"
    local ip
    
    # Essayer avec ip addr
    if command -v ip >/dev/null 2>&1; then
        ip=$(ip addr show "$interface" 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -n1)
    # Essayer avec ifconfig
    elif command -v ifconfig >/dev/null 2>&1; then
        ip=$(ifconfig "$interface" 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -n1)
    fi
    
    echo "$ip"
}

# Fonction pour récupérer l'IP NetBird
get_netbird_ip() {
    local ip
    ip=$(get_interface_ip "$NETBIRD_INTERFACE")
    if [ -z "$ip" ]; then
        echo "localhost"
    else
        echo "$ip"
    fi
}

# Fonction pour générer un ID machine unique
get_machine_id() {
    local machine_id=""
    
    # Essayer /etc/machine-id (Linux systemd)
    if [ -f /etc/machine-id ]; then
        machine_id=$(cat /etc/machine-id)
    # Essayer /var/lib/dbus/machine-id
    elif [ -f /var/lib/dbus/machine-id ]; then
        machine_id=$(cat /var/lib/dbus/machine-id)
    # Générer un UUID aléatoire
    elif command -v uuidgen >/dev/null 2>&1; then
        machine_id=$(uuidgen | tr -d '-')
    else
        # Fallback: générer un ID aléatoire
        machine_id=$(openssl rand -hex 16)
    fi
    
    echo "$machine_id"
}

# 1. Récupérer l'IP NetBird
log "🌐 Récupération de l'adresse IP NetBird..."
netbird_ip=$(get_netbird_ip)
log "   IP NetBird: $netbird_ip"

# 2. Lire le mot de passe LDAP existant
LDAP_SECRET_FILE="$LDAP_DIR/.env"
log "🔐 Lecture du mot de passe admin LDAP dans $LDAP_SECRET_FILE..."
if [ ! -f "$LDAP_SECRET_FILE" ]; then
    log "❌ $LDAP_SECRET_FILE introuvable"
    echo "❌ $LDAP_SECRET_FILE introuvable"
    echo "   Crée le fichier avec LDAP_ADMIN_PASSWORD avant de relancer."
    exit 1
fi

ldap_admin_password=$(grep -E '^LDAP_ADMIN_PASSWORD=' "$LDAP_SECRET_FILE" | tail -n1 | cut -d'=' -f2-)

if [ -z "${ldap_admin_password:-}" ]; then
    log "❌ LDAP_ADMIN_PASSWORD absent dans $LDAP_SECRET_FILE"
    echo "❌ LDAP_ADMIN_PASSWORD absent dans $LDAP_SECRET_FILE"
    exit 1
fi

log "   ✅ Mot de passe LDAP récupéré"

# 4. Générer l'ID machine
log "🔑 Génération de l'ID machine..."
instance_id=$(get_machine_id)
log "   Instance ID: $instance_id"

# 5. Créer le fichier .env pour Ryvie-rDrive
rdrive_env="$RDRIVE_DIR/.env"
log "📝 Création du fichier .env pour Ryvie-rDrive..."
log "   Fichier: $rdrive_env"

cat > "$rdrive_env" << EOF

REACT_APP_FRONTEND_URL=http://$netbird_ip:3010
REACT_APP_BACKEND_URL=http://$netbird_ip:4000
REACT_APP_WEBSOCKET_URL=ws://$netbird_ip:4000/ws
REACT_APP_ONLYOFFICE_CONNECTOR_URL=http://$netbird_ip:5000
REACT_APP_ONLYOFFICE_DOCUMENT_SERVER_URL=http://$netbird_ip:8090
LDAP_BIND_PASSWORD=$ldap_admin_password
# Service OAuth centralisé (NE PAS MODIFIER)
OAUTH_SERVICE_URL=https://cloudoauth-files.ryvie.fr
INSTANCE_ID=$instance_id
EOF

# 6. Sécuriser le fichier .env
# chmod 600 "$rdrive_env"
# log "   ✅ Fichier .env créé et sécurisé"

#==========================================
# INSTALLATION ET LANCEMENT DE RDRIVE
#==========================================

log "-----------------------------------------------------"
log "Installation et lancement de Ryvie rDrive (compose unique)"
log "-----------------------------------------------------"

# Dossier rDrive

# Permissions sécurisées : NE JAMAIS chown -R sur DOCKER_ROOT pour éviter de casser les volumes
# Seul le dossier racine /data (non récursif)
DATA_ROOT="/data"
EXEC_USER="${SUDO_USER:-$(whoami)}"
log "🔐 Application des permissions sécurisées sur $DATA_ROOT (non récursif)"
echo "🔐 Application des permissions sécurisées sur $DATA_ROOT (non récursif)"
sudo chown "$EXEC_USER:$EXEC_USER" "$DATA_ROOT" || true
sudo chmod 755 "$DATA_ROOT" || true

# 1) Vérifier la présence du compose et du .env
cd "$RDRIVE_DIR" || { 
    log "❌ Impossible d'accéder à $RDRIVE_DIR"
    echo "❌ Impossible d'accéder à $RDRIVE_DIR"
    exit 1
}

if [ ! -f docker-compose.yml ]; then
    log "❌ docker-compose.yml introuvable dans $RDRIVE_DIR"
    echo "❌ docker-compose.yml introuvable dans $RDRIVE_DIR"
    echo "   Place le fichier docker-compose.yml ici puis relance."
    exit 1
fi

# Vérifier que le .env existe
if [ ! -f "$rdrive_env" ]; then
    log "❌ $rdrive_env introuvable"
    echo "❌ $rdrive_env introuvable"
    exit 1
fi

# 2) Lancement unique
log "🚀 Démarrage de la stack rDrive…"
echo "🚀 Démarrage de la stack rDrive…"
sudo docker compose --env-file "$rdrive_env" pull || true
sudo docker compose --env-file "$rdrive_env" up -d --build

echo ""
log "🧪 Test rclone (container app-rdrive-node)"
echo "🧪 Test rclone (container app-rdrive-node)"
if command -v docker >/dev/null 2>&1 && sudo docker ps --format '{{.Names}}' | grep -q '^app-rdrive-node$'; then
    sudo docker exec -it app-rdrive-node sh -lc '/usr/bin/rclone version && /usr/bin/rclone --config /root/.config/rclone/rclone.conf listremotes -vv' || true
else
    log "ℹ️ Container app-rdrive-node non démarré (test container ignoré)"
    echo "ℹ️ Container app-rdrive-node non démarré (test container ignoré)"
fi

# 3) Attentes/health (best-effort)
log "⏳ Attente des services (mongo, onlyoffice, node, frontend)…"
echo "⏳ Attente des services (mongo, onlyoffice, node, frontend)…"

wait_for_service() {
    local svc="$1"
    local retries=60
    while [ $retries -gt 0 ]; do
        local container_id
        container_id=$(sudo docker compose ps -q "$svc" 2>/dev/null || true)

        if [ -n "$container_id" ]; then
            local state
            state=$(sudo docker inspect --format='{{.State.Status}}' "$container_id" 2>/dev/null || echo "")

            if [ "$state" = "running" ]; then
                local health
                health=$(sudo docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container_id" 2>/dev/null || echo "")

                if [ "$health" = "healthy" ]; then
                    log "✅ $svc healthy"
                    echo "✅ $svc healthy"
                    return 0
                fi

                log "✅ $svc en cours d'exécution"
                echo "✅ $svc en cours d'exécution"
                return 0
            fi
        fi

        sleep 2
        retries=$((retries-1))
    done
    log "⚠️ Timeout d'attente pour $svc"
    echo "⚠️ Timeout d'attente pour $svc"
    return 1
}

# Attendre les services principaux
wait_for_service "mongo" || true
wait_for_service "onlyoffice" || true
wait_for_service "node" || true
wait_for_service "frontend" || true

# 7. Afficher le résumé
log "═══════════════════════════════════════════════════════════════"
log "✅ INSTALLATION TERMINÉE"
log "═══════════════════════════════════════════════════════════════"
log "📁 Répertoire Ryvie-rDrive: $RDRIVE_DIR"
log "📄 Fichier .env: $rdrive_env"
log "📄 Fichier LDAP .env: $LDAP_DIR/.env"
log "🌐 IP NetBird: $netbird_ip"
log "🔑 Instance ID: $instance_id"
log "📋 Log complet: $LOG_FILE"
log "═══════════════════════════════════════════════════════════════"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ rDrive est lancé via docker-compose unique."
echo "   Frontend accessible (par défaut) sur http://$netbird_ip:3010"
echo ""
echo "📁 Fichiers créés:"
echo "   - $rdrive_env"
echo "   - $LDAP_DIR/.env"
echo ""
echo "� Log complet: $LOG_FILE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
