// CraftOS layout tweaks:
// - hides the Activities button (GNOME has no setting for it); the CraftOS
//   menu (ArcMenu) replaces it at the top left;
// - Frosted Glass, like Pop!_OS COSMIC's: liquid glass on the dock
//   (glass.js), frosted menus and pop-ups (menus.js), frosted windows and top
//   bar (windows.js, via Blur My Shell). Each has a switch, and all share the
//   frost thickness and glass opacity sliders (Settings > Frosted Glass).
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {LiquidGlass} from './glass.js';
import {FrostedMenus} from './menus.js';
import {FrostedWindows} from './windows.js';

export default class CraftOSShell extends Extension {
    enable() {
        this._activities = Main.panel.statusArea.activities;
        this._activities?.container.hide();

        this._settings = this.getSettings();
        this._parts = [
            new LiquidGlass(this._settings),
            new FrostedMenus(this._settings),
            new FrostedWindows(this._settings),
        ];
        for (const part of this._parts)
            part.enable();
    }

    disable() {
        for (const part of this._parts ?? [])
            part.disable();
        this._parts = null;
        this._settings = null;

        this._activities?.container.show();
        this._activities = null;
    }
}
