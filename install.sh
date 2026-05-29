#!/usr/bin/env bash
# Installe l'extension GNOME Shell claude-usage-indicator.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID="claude-usage-indicator@kiboko.fr"
INSTALL_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

echo "==> Copie de l'extension dans ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"
cp "${SCRIPT_DIR}/metadata.json" \
   "${SCRIPT_DIR}/extension.js"  \
   "${SCRIPT_DIR}/stylesheet.css" \
   "${INSTALL_DIR}/"

echo "==> Activation de l'extension"
gnome-extensions enable "${UUID}" 2>/dev/null || true

echo ""
echo "==> Installation terminée."
echo ""
echo "    IMPORTANT (Wayland) : GNOME Shell ne peut pas être rechargé à chaud."
echo "    Déconnectez-vous et reconnectez-vous pour activer l'extension."
echo ""
echo "    Vérification après reconnexion :"
echo "      gnome-extensions info ${UUID}"
echo ""
echo "    Logs en direct :"
echo "      journalctl -f /usr/bin/gnome-shell --output cat | grep claude-usage"
