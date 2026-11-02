// CraftOS layout tweaks:
// - hides the Activities button (GNOME has no setting for it); the CraftOS
//   menu (ArcMenu) replaces it at the top left;
// - gives the dock the CraftOS "liquid glass" look (glass.js).
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {LiquidGlass} from './glass.js';

export default class CraftOSShell extends Extension {
    enable() {
        this._activities = Main.panel.statusArea.activities;
        this._activities?.container.hide();

        this._glass = new LiquidGlass();
        this._glass.enable();
    }

    disable() {
        this._glass?.disable();
        this._glass = null;

        this._activities?.container.show();
        this._activities = null;
    }
}
