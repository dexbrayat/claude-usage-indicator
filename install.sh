#!/usr/bin/env bash
# Installe l'extension GNOME Shell claude-usage-indicator.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID="claude-usage-indicator@exbrayat.net"
INSTALL_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

echo "==> Copie de l'extension dans ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"
cp "${SCRIPT_DIR}/metadata.json" \
   "${SCRIPT_DIR}/extension.js"  \
   "${SCRIPT_DIR}/stylesheet.css" \
   "${SCRIPT_DIR}/claude-logo.png" \
   "${INSTALL_DIR}/"

# icon.png est la convention GNOME Extensions pour l'icône affichée dans la liste
cp "${SCRIPT_DIR}/ubuntu-claude-code-indicator.png" "${INSTALL_DIR}/icon.png"

echo "==> Activation de l'extension"
gnome-extensions enable "${UUID}" 2>/dev/null || true

DESKTOP_DIR="${HOME}/.local/share/applications"
DESKTOP_FILE="${DESKTOP_DIR}/claude-usage-indicator-relaunch.desktop"

echo "==> Installation du lanceur de réactivation"
mkdir -p "${DESKTOP_DIR}"
cat > "${DESKTOP_FILE}" <<EOF
[Desktop Entry]
Type=Application
Name=Relancer Claude Usage Indicator
Comment=Réactive l'extension GNOME Shell Claude Usage Indicator si elle a été désactivée
Exec=gnome-extensions enable ${UUID}
Icon=${INSTALL_DIR}/icon.png
Terminal=false
Categories=Utility;
EOF

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
