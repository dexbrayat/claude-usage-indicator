import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const CREDENTIALS_PATH = `${GLib.get_home_dir()}/.claude/.credentials.json`;
const USAGE_API    = 'https://api.anthropic.com/api/oauth/usage';
const REFRESH_API  = 'https://claude.ai/api/auth/token';

const INTERVALS = [
    { label: 'Manuel',      seconds: null },
    { label: '30 secondes', seconds: 30   },
    { label: '1 minute',    seconds: 60   },
    { label: '2 minutes',   seconds: 120  },
    { label: '5 minutes',   seconds: 300  },
    { label: '10 minutes',  seconds: 600  },
];
const DEFAULT_POLL_SECONDS = 120;

// ─────────────────────────────────────────────────────────────────────────────

export default class ClaudeUsageExtension extends Extension {
    enable() {
        this._indicator = new ClaudeIndicator(this.path, this.uuid);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────

const ClaudeIndicator = GObject.registerClass(
class ClaudeIndicator extends PanelMenu.Button {
    _init(extensionPath, uuid) {
        super._init(0.0, 'Claude Usage Indicator', false);

        this._alive       = true;
        this._uuid        = uuid;
        this._pollSource  = null;
        this._pollSeconds = DEFAULT_POLL_SECONDS;
        this._httpSession = new Soup.Session();

        // ── Panel widget ──────────────────────────────────────────────
        const box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });

        const iconFile = Gio.File.new_for_path(`${extensionPath}/claude-logo.png`);
        const icon = new St.Icon({
            gicon: new Gio.FileIcon({ file: iconFile }),
            icon_size: 16,
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(icon);

        this._label = new St.Label({
            text: 'Claude …',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'claude-usage-label',
        });
        box.add_child(this._label);
        this.add_child(box);

        // ── Dropdown menu ─────────────────────────────────────────────
        this._sessionItem    = this._menuItem('Session 5h : …');
        this._resetItem      = this._menuItem('Reset dans : …');
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._weeklyItem     = this._menuItem('7 jours : …');
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._lastUpdateItem = this._menuItem('Dernière MAJ : jamais');

        const usageLinkItem = new PopupMenu.PopupMenuItem('Voir l\'utilisation sur claude.ai');
        usageLinkItem.connect('activate', () => {
            Gio.AppInfo.launch_default_for_uri('https://claude.ai/new#settings/usage', null);
        });
        this.menu.addMenuItem(usageLinkItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const refreshItem = new PopupMenu.PopupMenuItem('Rafraîchir');
        refreshItem.connect('activate', () => this._poll().catch(logError));
        this.menu.addMenuItem(refreshItem);

        const intervalMenu = new PopupMenu.PopupSubMenuMenuItem('Intervalle : 2 minutes');
        this._intervalMenuLabel = intervalMenu.label;
        this._intervalItems = [];
        for (const { label, seconds } of INTERVALS) {
            const item = new PopupMenu.PopupMenuItem(
                (seconds === this._pollSeconds ? '✓ ' : '    ') + label
            );
            item.connect('activate', () => this._setInterval(seconds, label, item));
            intervalMenu.menu.addMenuItem(item);
            this._intervalItems.push({ item, label, seconds });
        }
        this.menu.addMenuItem(intervalMenu);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const quitItem = new PopupMenu.PopupMenuItem('Quitter l\'indicateur');
        quitItem.connect('activate', () => {
            try {
                const proc = new Gio.Subprocess({
                    argv: ['gnome-extensions', 'disable', this._uuid],
                    flags: Gio.SubprocessFlags.NONE,
                });
                proc.init(null);
            } catch (e) {
                logError(e);
            }
        });
        this.menu.addMenuItem(quitItem);

        this._startPolling();
    }

    _menuItem(text) {
        const item = new PopupMenu.PopupMenuItem(text, { reactive: false });
        this.menu.addMenuItem(item);
        return item;
    }

    // ── Credentials ───────────────────────────────────────────────────

    _loadCredentials() {
        try {
            const [, raw] = Gio.File.new_for_path(CREDENTIALS_PATH).load_contents(null);
            return JSON.parse(new TextDecoder().decode(raw))?.claudeAiOauth ?? null;
        } catch (e) {
            console.error(`[claude-usage] credentials: ${e.message}`);
            return null;
        }
    }

    _saveCredentials(creds) {
        try {
            Gio.File.new_for_path(CREDENTIALS_PATH).replace_contents(
                new TextEncoder().encode(JSON.stringify({ claudeAiOauth: creds })),
                null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null
            );
        } catch (e) {
            console.error(`[claude-usage] save: ${e.message}`);
        }
    }

    // ── HTTP ──────────────────────────────────────────────────────────

    _sendAsync(msg) {
        return new Promise((resolve, reject) => {
            this._httpSession.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (session, res) => {
                try {
                    const bytes = session.send_and_read_finish(res);
                    resolve({ status: msg.status_code, bytes });
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    async _refreshToken(creds) {
        const body = JSON.stringify({ grant_type: 'refresh_token', refresh_token: creds.refreshToken });
        const msg  = Soup.Message.new('POST', REFRESH_API);
        msg.get_request_headers().append('Content-Type', 'application/json');
        msg.set_request_body_from_bytes(
            'application/json',
            new GLib.Bytes(new TextEncoder().encode(body))
        );
        const { status, bytes } = await this._sendAsync(msg);
        if (status === Soup.Status.OK) {
            const newCreds = JSON.parse(new TextDecoder().decode(bytes.get_data()));
            this._saveCredentials(newCreds);
            return newCreds;
        }
        console.warn(`[claude-usage] refresh failed: HTTP ${status}`);
        return null;
    }

    async _fetchUsage() {
        let creds = this._loadCredentials();
        if (!creds) return null;

        if (Date.now() >= (creds.expiresAt ?? 0) - 60_000)
            creds = await this._refreshToken(creds) ?? this._loadCredentials();
        if (!creds) return null;

        const makeMsg = token => {
            const m = Soup.Message.new('GET', USAGE_API);
            m.get_request_headers().append('Authorization', `Bearer ${token}`);
            return m;
        };

        let { status, bytes } = await this._sendAsync(makeMsg(creds.accessToken));

        if (status === Soup.Status.UNAUTHORIZED) {
            const refreshed = await this._refreshToken(creds);
            if (!refreshed) return null;
            ({ status, bytes } = await this._sendAsync(makeMsg(refreshed.accessToken)));
        }

        if (status !== Soup.Status.OK) {
            console.warn(`[claude-usage] API HTTP ${status}`);
            return null;
        }
        return JSON.parse(new TextDecoder().decode(bytes.get_data()));
    }

    // ── Formatting ────────────────────────────────────────────────────

    _timeUntil(iso) {
        if (!iso) return '?';
        const secs = Math.floor((new Date(iso) - Date.now()) / 1000);
        if (secs <= 0) return 'maintenant';
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
    }

    // ── UI update ─────────────────────────────────────────────────────

    async _poll() {
        let usage = null;
        try {
            usage = await this._fetchUsage();
        } catch (e) {
            console.error(`[claude-usage] poll error: ${e.message}`);
        }

        if (!this._alive) return;  // extension disabled while request was in flight

        if (!usage) {
            this._lastUpdateItem.label.set_text(
                `Dernière MAJ : erreur réseau (${new Date().toLocaleTimeString('fr-FR')})`
            );
            return;
        }

        this._lastUpdateItem.label.set_text(
            `Dernière MAJ : ${new Date().toLocaleTimeString('fr-FR')}`
        );

        const five = usage.five_hour ?? {};
        const week = usage.seven_day ?? {};
        const fmt  = v => v != null ? `${Math.round(v)}%` : '—';

        const sPct = fmt(five.utilization);
        this._label.set_text(`Claude ${sPct}`);
        this._sessionItem.label.set_text(`Session 5h : ${sPct}`);
        this._resetItem.label.set_text(`Reset dans : ${this._timeUntil(five.resets_at)}`);
        this._weeklyItem.label.set_text(
            `7 jours : ${fmt(week.utilization)}  (reset ${this._timeUntil(week.resets_at)})`
        );
    }

    // ── Lifecycle ─────────────────────────────────────────────────────

    _setInterval(seconds, label, selectedItem) {
        this._pollSeconds = seconds;

        for (const { item, label: lbl } of this._intervalItems)
            item.label.set_text((item === selectedItem ? '✓ ' : '    ') + lbl);

        this._intervalMenuLabel.set_text(`Intervalle : ${label}`);

        if (this._pollSource !== null) {
            GLib.source_remove(this._pollSource);
            this._pollSource = null;
        }
        if (seconds !== null) {
            this._pollSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
                this._poll().catch(logError);
                return GLib.SOURCE_CONTINUE;
            });
        }
    }

    _startPolling() {
        this._poll().catch(logError);
        this._pollSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this._pollSeconds, () => {
            this._poll().catch(logError);
            return GLib.SOURCE_CONTINUE;
        });
    }

    destroy() {
        this._alive = false;
        if (this._pollSource !== null) {
            GLib.source_remove(this._pollSource);
            this._pollSource = null;
        }
        this._httpSession.abort();
        super.destroy();
    }
});
