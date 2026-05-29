# claude-usage-indicator

Indicateur d'utilisation Claude.ai dans la topbar GNOME (Wayland, Ubuntu 24.04).

Affiche en temps réel la consommation de tokens : session 5h, hebdomadaire et routines.

## Prérequis

- Ubuntu 24.04, GNOME Shell avec l'extension [AppIndicator](https://extensions.gnome.org/extension/615/appindicator-support/)
- Python 3.12
- Compte Claude.ai connecté via Claude Code (`~/.claude/.credentials.json` présent)

## Installation

```bash
bash install.sh
```

Le script installe les dépendances système, copie le binaire dans `/usr/local/bin/` et active le service systemd user.

## Utilisation

```bash
# Logs en direct
journalctl --user -u claude-usage-indicator.service -f

# Lancer manuellement pour déboguer
CLAUDE_INDICATOR_DEBUG=1 python3 claude_usage_indicator.py

# Redémarrer après mise à jour du script
sudo install -m 755 claude_usage_indicator.py /usr/local/bin/claude-usage-indicator
systemctl --user restart claude-usage-indicator.service
```

## Fonctionnement

- Poll `https://api.anthropic.com/api/oauth/usage` toutes les 120 secondes
- Token OAuth lu dans `~/.claude/.credentials.json` (clé `claudeAiOauth.accessToken`)
- Refresh automatique du token en cas d'expiration
