// CraftOS layout tweaks. GNOME 43 has no setting to hide the Activities
// button; the CraftOS menu (ArcMenu) replaces it at the top left.
const Main = imports.ui.main;

class Extension {
    enable() {
        this._activities = Main.panel.statusArea.activities;
        this._activities?.container.hide();
    }

    disable() {
        this._activities?.container.show();
        this._activities = null;
    }
}

function init() {
    return new Extension();
}
