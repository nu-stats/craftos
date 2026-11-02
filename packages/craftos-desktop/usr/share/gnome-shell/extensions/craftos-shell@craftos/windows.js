// CraftOS Frosted Glass on windows and the top bar. Blur My Shell draws these;
// this keeps its settings in step with the Frosted Glass switches and sliders
// (applied when the shell starts and whenever they change). Its schema lives
// in its own folder on Debian 13, so it is loaded from there.
import Gio from 'gi://Gio';

import {frostRadius, glassAlpha} from './glass.js';

const BMS_SCHEMAS = '/usr/share/gnome-shell/extensions/blur-my-shell@aunetx/schemas';
const BMS = 'org.gnome.shell.extensions.blur-my-shell';

function bmsSettings(child) {
    try {
        const source = Gio.SettingsSchemaSource.new_from_directory(
            BMS_SCHEMAS, Gio.SettingsSchemaSource.get_default(), false);
        const schema = source.lookup(`${BMS}.${child}`, true);
        return schema ? new Gio.Settings({settings_schema: schema}) : null;
    } catch (e) {
        return null;
    }
}

export class FrostedWindows {
    constructor(settings) {
        this._settings = settings;
    }

    enable() {
        this._apps = bmsSettings('applications');
        this._panel = bmsSettings('panel');
        this._settingsIds = ['glass-windows', 'glass-panel', 'frost', 'opacity'].map(key =>
            this._settings.connect(`changed::${key}`, () => this._sync()));
        this._sync();
    }

    _set(settings, key, value, type) {
        if (!settings)
            return;
        const current = settings[`get_${type}`](key);
        if (current !== value)
            settings[`set_${type}`](key, value);
    }

    _sync() {
        // Every window, except ones where see-through hurts (video, games).
        const windows = this._settings.get_boolean('glass-windows');
        this._set(this._apps, 'blur', windows, 'boolean');
        this._set(this._apps, 'enable-all', true, 'boolean');
        this._set(this._apps, 'sigma', frostRadius(this._settings), 'int');
        this._set(this._apps, 'opacity', Math.round(255 * glassAlpha(this._settings)), 'int');
        this._set(this._panel, 'blur', this._settings.get_boolean('glass-panel'), 'boolean');
    }

    disable() {
        for (const id of this._settingsIds)
            this._settings.disconnect(id);
        this._settingsIds = [];
        this._apps = null;
        this._panel = null;
    }
}
