#!/usr/bin/env bash
# Installe claude-usage-indicator et active le service systemd user.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_BIN="/usr/local/bin/claude-usage-indicator"
SERVICE_DIR="${HOME}/.config/systemd/user"
SERVICE_NAME="claude-usage-indicator.service"

echo "==> Dépendances système (sudo requis)"
sudo apt-get update -qq
sudo apt-get install -y \
    gir1.2-ayatanaappindicator3-0.1 \
    python3-gi \
    python3-gi-cairo \
    gir1.2-gtk-3.0 \
    python3-requests

echo "==> Installation du binaire"
sudo install -m 755 "${SCRIPT_DIR}/claude_usage_indicator.py" "${INSTALL_BIN}"

echo "==> Installation du service systemd user"
mkdir -p "${SERVICE_DIR}"
cp "${SCRIPT_DIR}/${SERVICE_NAME}" "${SERVICE_DIR}/"

# S'assurer que les variables de session Wayland sont exportées vers systemd
systemctl --user import-environment DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS XDG_RUNTIME_DIR 2>/dev/null || true

systemctl --user daemon-reload
systemctl --user enable "${SERVICE_NAME}"
systemctl --user restart "${SERVICE_NAME}"

echo ""
echo "==> Statut du service :"
systemctl --user status "${SERVICE_NAME}" --no-pager || true

echo ""
echo "==> Installation terminée."
echo "    Logs : journalctl --user -u ${SERVICE_NAME} -f"
echo "    Debug : CLAUDE_INDICATOR_DEBUG=1 python3 ${SCRIPT_DIR}/claude_usage_indicator.py"