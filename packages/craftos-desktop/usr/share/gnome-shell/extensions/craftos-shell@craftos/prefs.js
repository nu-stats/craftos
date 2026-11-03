// Settings > Frosted Glass: where the glass goes, and how it looks. Opened
// from the "Frosted Glass" launcher (gnome-extensions prefs craftos-shell@craftos).
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function switchRow(settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function sliderRow(settings, key, title, subtitle, min, max, lowLabel, highLabel) {
    const row = new Adw.ActionRow({title, subtitle});
    const adjustment = new Gtk.Adjustment({lower: min, upper: max, step_increment: 1, page_increment: 10});
    settings.bind(key, adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
    const scale = new Gtk.Scale({
        adjustment, draw_value: false, hexpand: true, width_request: 240,
        valign: Gtk.Align.CENTER,
    });
    scale.add_mark(min, Gtk.PositionType.BOTTOM, lowLabel);
    scale.add_mark(max, Gtk.PositionType.BOTTOM, highLabel);
    row.add_suffix(scale);
    return row;
}

export default class CraftOSShellPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_title('Frosted Glass');
        window.set_default_size(620, 640);

        const page = new Adw.PreferencesPage({
            title: 'Frosted Glass', icon_name: 'preferences-desktop-appearance-symbolic',
        });

        const where = new Adw.PreferencesGroup({
            title: 'Frosted Glass',
            description: 'See-through, blurred glass that shows what is behind it.',
        });
        where.add(switchRow(settings, 'glass-windows', 'Windows',
            'App windows let the desktop and other windows show through'));
        where.add(switchRow(settings, 'glass-panel', 'Top bar', null));
        where.add(switchRow(settings, 'glass-dock', 'Dock',
            'Liquid glass: a lens-like slab that bends the light at its edges'));
        where.add(switchRow(settings, 'glass-menus', 'Menus and pop-ups',
            'The CraftOS menu, quick settings, calendar and right-click menus'));
        page.add(where);

        const look = new Adw.PreferencesGroup({title: 'Look'});
        look.add(sliderRow(settings, 'frost', 'Frost thickness',
            'How strongly what is behind the glass is blurred', 0, 100, 'Clear', 'Thick'));
        look.add(sliderRow(settings, 'opacity', 'Glass opacity',
            'How much shows through the glass', 40, 100, 'See-through', 'Solid'));
        look.add(sliderRow(settings, 'dock-glass', 'Dock glass',
            'How clear the liquid glass dock is', 0, 100, 'Clear', 'Frosted'));
        const reset = new Adw.ActionRow({title: 'Restore defaults'});
        const button = new Gtk.Button({label: 'Reset', valign: Gtk.Align.CENTER});
        button.connect('clicked', () => {
            for (const key of settings.settings_schema.list_keys())
                settings.reset(key);
        });
        reset.add_suffix(button);
        look.add(reset);
        page.add(look);

        window.add(page);
    }
}
