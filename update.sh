#!/usr/bin/env bash
# Met à jour l'extension GNOME Shell claude-usage-indicator.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID="claude-usage-indicator@exbrayat.net"
INSTALL_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

if [ ! -d "${INSTALL_DIR}" ]; then
    echo "Extension non installée. Lance install.sh d'abord."
    exit 1
fi

echo "==> Mise à jour de l'extension dans ${INSTALL_DIR}"
cp "${SCRIPT_DIR}/metadata.json" \
   "${SCRIPT_DIR}/extension.js"  \
   "${SCRIPT_DIR}/stylesheet.css" \
   "${SCRIPT_DIR}/claude-logo.png" \
   "${INSTALL_DIR}/"

echo ""
echo "==> Mise à jour terminée."
echo ""
echo "    IMPORTANT (Wayland) : GNOME Shell ne peut pas être rechargé à chaud."
echo "    Déconnectez-vous et reconnectez-vous pour appliquer les changements."
echo ""
