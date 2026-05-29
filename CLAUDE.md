# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Objectif

Daemon Python affichant l'utilisation du compte Claude.ai (session 5h, hebdomadaire, routines) dans la topbar GNOME sous Wayland/Ubuntu 24.04.

## Stack technique

- Python 3.12, `gi.repository.AppIndicator3` (libayatana), `requests`
- Systemd user service (`~/.config/systemd/user/`)
- Extension GNOME AppIndicator requise dans GNOME Shell

## Commandes utiles

```bash
# Lancer manuellement (debug visuel)
CLAUDE_INDICATOR_DEBUG=1 python3 claude_usage_indicator.py

# Installer et démarrer le service
bash install.sh

# Logs du service
journalctl --user -u claude-usage-indicator.service -f

# Redémarrer après modification
sudo install -m 755 claude_usage_indicator.py /usr/local/bin/claude-usage-indicator
systemctl --user restart claude-usage-indicator.service
```

## Architecture

Tout le code est dans `claude_usage_indicator.py` (classe `ClaudeUsageIndicator`) :

- **Credentials** — `_load_credentials()` lit `~/.claude/.credentials.json`, clé `claudeAiOauth.accessToken`. L'expiry est en millisecondes (`expiresAt`). Si expiré, `_refresh_token()` appelle `POST https://claude.ai/api/auth/token` avec `grant_type=refresh_token` et réécrit le fichier.
- **Polling** — thread daemon qui appelle `GET https://api.anthropic.com/api/oauth/usage` toutes les 120 s avec `Bearer <accessToken>`. Sur 401, tente un refresh puis rejoue.
- **UI** — `GLib.idle_add(self._update_ui, usage)` renvoie les résultats sur le thread GTK principal. Le label topbar affiche `Claude X%` (session 5h). Le menu déroulant détaille session, reset timer, hebdo et routines.
- **Champs API** — réponse confirmée : `five_hour.utilization` (float %), `five_hour.resets_at` (ISO 8601), `seven_day.utilization`, `seven_day.resets_at`. Les champs `seven_day_opus`, `seven_day_sonnet`, `seven_day_cowork`, etc. sont présents mais souvent `null` sur un compte Pro standard. Activer `CLAUDE_INDICATOR_DEBUG=1` pour logger la réponse brute.

## Notes de déploiement

Le service systemd user hérite des variables `DISPLAY`, `WAYLAND_DISPLAY`, `DBUS_SESSION_BUS_ADDRESS` et `XDG_RUNTIME_DIR` via `import-environment` (appelé par `install.sh`). Sans ces variables, GTK ne trouve pas la session graphique.