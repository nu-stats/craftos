// CraftOS layout tweaks. GNOME has no setting to hide the Activities
// button; the CraftOS menu (ArcMenu) replaces it at the top left.
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class CraftOSShell extends Extension {
    enable() {
        this._activities = Main.panel.statusArea.activities;
        this._activities?.container.hide();
    }

    disable() {
        this._activities?.container.show();
        this._activities = null;
    }
}
