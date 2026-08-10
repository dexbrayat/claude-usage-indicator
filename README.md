# claude-usage-indicator

Extension GNOME Shell native affichant l'utilisation Claude.ai dans la topbar.

Affiche en temps réel : session 5h (%), 7 jours (%), timer avant reset.

![Menu topbar déroulé](screenshot-claude-code-indicator.png)

## Prérequis

- GNOME Shell 45, 46 ou 47 (Ubuntu 24.04 → GNOME 46)
- Compte Claude.ai connecté via Claude Code (`~/.claude/.credentials.json` présent)

## Installation

```bash
bash install.sh
```

Puis **déconnectez-vous et reconnectez-vous** (requis sous Wayland — GNOME Shell
ne peut pas être rechargé à chaud).

`install.sh` installe aussi un lanceur **« Relancer Claude Usage Indicator »**
dans les activités GNOME (voir [Relancer l'extension](#relancer-lextension)).

## Mise à jour

```bash
bash update.sh
```

Puis **déconnectez-vous et reconnectez-vous**.

## Relancer l'extension

Si l'extension a été désactivée ou quittée (via l'appli **Extensions**, un
crash, ou manuellement), inutile de se déconnecter/reconnecter : la
réactivation d'une extension GNOME Shell fonctionne à chaud.

Deux façons de la relancer :

- Depuis les activités GNOME, cherchez **« Relancer Claude Usage Indicator »**
  et lancez-la (lanceur installé automatiquement par `install.sh`).
- En ligne de commande :

  ```bash
  gnome-extensions enable claude-usage-indicator@exbrayat.net
  ```

(Seule une modification du code de l'extension nécessite une
déconnexion/reconnexion sous Wayland — pas une simple réactivation.)

## Désinstallation

```bash
gnome-extensions disable claude-usage-indicator@exbrayat.net
rm -rf ~/.local/share/gnome-shell/extensions/claude-usage-indicator@exbrayat.net
rm -f ~/.local/share/applications/claude-usage-indicator-relaunch.desktop
```

## Débogage

```bash
# Logs de l'extension en direct
journalctl -f /usr/bin/gnome-shell --output cat | grep claude-usage

# Statut de l'extension
gnome-extensions info claude-usage-indicator@exbrayat.net

# Vérifier les erreurs JS dans Looking Glass
# Alt+F2 → lg → onglet Errors  (X11 uniquement)
```

## Fonctionnement

- Poll `https://api.anthropic.com/api/oauth/usage` toutes les 120 secondes via `Soup.Session`
- Token OAuth lu dans `~/.claude/.credentials.json` (clé `claudeAiOauth.accessToken`)
- Refresh automatique du token si `expiresAt` dépassé

## Source

https://codeberg.org/dexbrayat/claude-usage-indicator
