#!/usr/bin/env python3
"""Claude.ai usage indicator daemon for GNOME topbar."""

import json
import os
import signal
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('AyatanaAppIndicator3', '0.1')
from gi.repository import AyatanaAppIndicator3 as AppIndicator3, GLib, Gtk
import requests

CREDENTIALS_PATH = Path.home() / '.claude' / '.credentials.json'
USAGE_API = 'https://api.anthropic.com/api/oauth/usage'
REFRESH_API = 'https://claude.ai/api/auth/token'
POLL_INTERVAL = 120  # seconds


class ClaudeUsageIndicator:
    def __init__(self):
        self.indicator = AppIndicator3.Indicator.new(
            'claude-usage-indicator',
            'security-medium-symbolic',
            AppIndicator3.IndicatorCategory.APPLICATION_STATUS,
        )
        self.indicator.set_status(AppIndicator3.IndicatorStatus.ACTIVE)
        self.indicator.set_label('Claude …', '')

        self.menu = Gtk.Menu()

        self.session_item = Gtk.MenuItem(label='Session 5h : chargement…')
        self.session_item.set_sensitive(False)
        self.menu.append(self.session_item)

        self.session_reset_item = Gtk.MenuItem(label='Reset dans : …')
        self.session_reset_item.set_sensitive(False)
        self.menu.append(self.session_reset_item)

        self.menu.append(Gtk.SeparatorMenuItem())

        self.weekly_item = Gtk.MenuItem(label='Hebdo : chargement…')
        self.weekly_item.set_sensitive(False)
        self.menu.append(self.weekly_item)

        self.menu.append(Gtk.SeparatorMenuItem())

        self.routines_item = Gtk.MenuItem(label='Routines : chargement…')
        self.routines_item.set_sensitive(False)
        self.menu.append(self.routines_item)

        self.menu.append(Gtk.SeparatorMenuItem())

        self.last_update_item = Gtk.MenuItem(label='Dernière MAJ : jamais')
        self.last_update_item.set_sensitive(False)
        self.menu.append(self.last_update_item)

        self.menu.append(Gtk.SeparatorMenuItem())

        refresh_item = Gtk.MenuItem(label='Rafraîchir maintenant')
        refresh_item.connect('activate', self._on_manual_refresh)
        self.menu.append(refresh_item)

        quit_item = Gtk.MenuItem(label='Quitter')
        quit_item.connect('activate', lambda _: Gtk.main_quit())
        self.menu.append(quit_item)

        self.menu.show_all()
        self.indicator.set_menu(self.menu)

        self.running = True
        self._poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._poll_thread.start()

    # ------------------------------------------------------------------
    # Credentials

    def _load_credentials(self):
        try:
            with open(CREDENTIALS_PATH) as fh:
                return json.load(fh).get('claudeAiOauth', {})
        except (FileNotFoundError, json.JSONDecodeError) as exc:
            print(f'[credentials] {exc}', file=sys.stderr)
            return {}

    def _is_expired(self, creds: dict) -> bool:
        expires_at_ms = creds.get('expiresAt', 0)
        return time.time() * 1000 >= expires_at_ms - 60_000  # 1-min buffer

    def _refresh_token(self, creds: dict) -> dict:
        refresh_token = creds.get('refreshToken', '')
        if not refresh_token:
            return {}
        try:
            resp = requests.post(
                REFRESH_API,
                json={'grant_type': 'refresh_token', 'refresh_token': refresh_token},
                headers={'Content-Type': 'application/json'},
                timeout=10,
            )
            if resp.ok:
                new_creds = resp.json()
                full = {'claudeAiOauth': new_creds}
                with open(CREDENTIALS_PATH, 'w') as fh:
                    json.dump(full, fh)
                print('[token] rafraîchi', file=sys.stderr)
                return new_creds
            print(f'[token] refresh échoué {resp.status_code}', file=sys.stderr)
        except Exception as exc:
            print(f'[token] {exc}', file=sys.stderr)
        return {}

    def _get_valid_token(self) -> str:
        creds = self._load_credentials()
        if not creds:
            return ''
        if self._is_expired(creds):
            refreshed = self._refresh_token(creds)
            # Fall through with refreshed token or re-read (Claude Code may have refreshed)
            creds = refreshed or self._load_credentials()
        return creds.get('accessToken', '')

    # ------------------------------------------------------------------
    # API

    def _fetch_usage(self) -> dict | None:
        token = self._get_valid_token()
        if not token:
            return None
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        }
        try:
            resp = requests.get(USAGE_API, headers=headers, timeout=15)
            if resp.status_code == 401:
                # Token may have just expired — try once more after refresh
                creds = self._load_credentials()
                refreshed = self._refresh_token(creds)
                if refreshed:
                    headers['Authorization'] = f"Bearer {refreshed['accessToken']}"
                    resp = requests.get(USAGE_API, headers=headers, timeout=15)
            if resp.ok:
                return resp.json()
            print(f'[api] HTTP {resp.status_code}: {resp.text[:200]}', file=sys.stderr)
        except Exception as exc:
            print(f'[api] {exc}', file=sys.stderr)
        return None

    # ------------------------------------------------------------------
    # Formatting helpers

    @staticmethod
    def _time_until(value) -> str:
        if not value:
            return '?'
        try:
            if isinstance(value, (int, float)):
                dt = datetime.fromtimestamp(value / 1000, tz=timezone.utc)
            else:
                dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
            delta = dt - datetime.now(timezone.utc)
            secs = int(delta.total_seconds())
            if secs <= 0:
                return 'maintenant'
            h, rem = divmod(secs, 3600)
            m = rem // 60
            return f'{h}h{m:02d}' if h else f'{m} min'
        except Exception:
            return '?'

    # ------------------------------------------------------------------
    # UI update (always called on GTK main thread via GLib.idle_add)

    def _update_ui(self, usage: dict | None):
        # API response shape (confirmed):
        # { "five_hour": {"utilization": 18.0, "resets_at": "..."}, "seven_day": {...}, ... }
        now_str = datetime.now().strftime('%H:%M:%S')
        self.last_update_item.set_label(f'Dernière MAJ : {now_str}')

        if usage is None:
            self.indicator.set_label('Claude ⚠', '')
            self.session_item.set_label('Session 5h : erreur réseau')
            self.weekly_item.set_label('7 jours : erreur réseau')
            self.routines_item.set_label('Opus/Sonnet : non dispo')
            return

        if os.environ.get('CLAUDE_INDICATOR_DEBUG'):
            print(json.dumps(usage, indent=2), file=sys.stderr)

        def _pct(block) -> str:
            if not block:
                return '—'
            u = block.get('utilization')
            return f'{u:.0f}%' if u is not None else '—'

        five_h = usage.get('five_hour') or {}
        seven_d = usage.get('seven_day') or {}
        opus = usage.get('seven_day_opus')
        sonnet = usage.get('seven_day_sonnet')

        s_pct = _pct(five_h)
        self.indicator.set_label(f'Claude {s_pct}', '')

        self.session_item.set_label(f'Session 5h : {s_pct}')
        reset_in = self._time_until(five_h.get('resets_at', ''))
        self.session_reset_item.set_label(f'Reset dans : {reset_in}')

        w_pct = _pct(seven_d)
        w_reset = self._time_until(seven_d.get('resets_at', ''))
        self.weekly_item.set_label(f'7 jours : {w_pct}  (reset {w_reset})')

        parts = []
        if opus is not None:
            parts.append(f'Opus {_pct(opus)}')
        if sonnet is not None:
            parts.append(f'Sonnet {_pct(sonnet)}')
        self.routines_item.set_label('  '.join(parts) if parts else 'Opus/Sonnet : inclus')

    # ------------------------------------------------------------------
    # Polling

    def _poll_loop(self):
        while self.running:
            usage = self._fetch_usage()
            GLib.idle_add(self._update_ui, usage)
            # Sleep in 1-second ticks so we can exit cleanly
            for _ in range(POLL_INTERVAL):
                if not self.running:
                    return
                time.sleep(1)

    def _on_manual_refresh(self, _widget):
        def _do():
            usage = self._fetch_usage()
            GLib.idle_add(self._update_ui, usage)
        threading.Thread(target=_do, daemon=True).start()


def main():
    def _quit(*_):
        Gtk.main_quit()

    signal.signal(signal.SIGTERM, _quit)
    signal.signal(signal.SIGINT, _quit)

    ClaudeUsageIndicator()
    Gtk.main()


if __name__ == '__main__':
    main()
