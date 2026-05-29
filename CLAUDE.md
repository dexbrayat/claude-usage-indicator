# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Objectif

Extension GNOME Shell native (JavaScript/GJS) affichant l'utilisation Claude.ai (session 5h, 7 jours) dans la topbar GNOME sous Wayland/Ubuntu 24.04.

## Stack technique

- JavaScript ES modules (GJS), GNOME Shell 45+
- `gi://Soup` (Soup 3) pour les requêtes HTTP
- `gi://Gio` pour la lecture/écriture de fichiers
- `PanelMenu.Button` + `PopupMenu` pour l'UI native

## Commandes utiles

```bash
# Installer l'extension (copie + enable)
bash install.sh
# Puis déconnexion/reconnexion obligatoire sous Wayland

# Mettre à jour l'extension après modification
cp extension.js stylesheet.css \
   ~/.local/share/gnome-shell/extensions/claude-usage-indicator@kiboko.fr/
# Puis déconnexion/reconnexion

# Logs de l'extension en direct
journalctl -f /usr/bin/gnome-shell --output cat | grep claude-usage

# Statut
gnome-extensions info claude-usage-indicator@kiboko.fr
```

## Architecture

Tout le code est dans `extension.js` — deux classes :

- **`ClaudeUsageExtension`** (export default) — point d'entrée GNOME Shell. `enable()` instancie `ClaudeIndicator` et l'ajoute au panel ; `disable()` le détruit.
- **`ClaudeIndicator`** (extends `PanelMenu.Button`) — logique complète :
  - `_loadCredentials()` / `_saveCredentials()` — lit/écrit `~/.claude/.credentials.json` via `Gio.File`
  - `_sendAsync(msg)` — wrapping Promise autour de `Soup.Session.send_and_read_async`
  - `_refreshToken(creds)` — `POST https://claude.ai/api/auth/token` avec `grant_type=refresh_token`
  - `_fetchUsage()` — `GET https://api.anthropic.com/api/oauth/usage`, refresh automatique sur 401
  - `_poll()` — async, met à jour le label topbar et le menu ; vérifie `this._alive` avant tout accès UI pour éviter les mises à jour après `disable()`
  - `_startPolling()` — premier poll immédiat + `GLib.timeout_add_seconds(120s)`
  - `destroy()` — pose `_alive = false`, retire le timeout, appelle `_httpSession.abort()`

## Réponse API confirmée

```json
{
  "five_hour":  { "utilization": 20.0, "resets_at": "2026-05-29T17:00:00+00:00" },
  "seven_day":  { "utilization": 11.0, "resets_at": "2026-06-01T07:00:00+00:00" },
  "seven_day_opus": null,
  "seven_day_sonnet": null
}
```

`utilization` est un pourcentage float direct (pas de tokens bruts).

## Déploiement

L'UUID de l'extension est `claude-usage-indicator@kiboko.fr`. Le répertoire d'installation cible est `~/.local/share/gnome-shell/extensions/claude-usage-indicator@kiboko.fr/`. Sous Wayland, un rechargement à chaud de GNOME Shell est impossible — une déconnexion/reconnexion est requise après toute modification.
