// CraftOS Frosted Glass on menus and pop-ups (the CraftOS menu, quick
// settings, the calendar, right-click menus). While a menu is open, a blur
// layer sits just below it and blurs whatever is behind, windows included;
// the menu itself gets a translucent light background (alpha from the glass
// opacity slider). Live blur does not work inside the menu's own actors, so
// the layer is a separate actor, like Blur My Shell's, with its corners
// rounded to match the menu. Follows the Frosted Glass "menus" switch and the
// frost / opacity sliders.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {frostRadius, glassAlpha} from './glass.js';

const CORNERS = `
uniform sampler2D tex;
uniform float width;
uniform float height;
uniform float radius;

float rounded_box(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + vec2(r);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main(void) {
    vec2 size = vec2(width, height);
    vec2 p = cogl_tex_coord_in[0].xy * size - size * 0.5;
    float a = clamp(0.5 - rounded_box(p, size * 0.5, radius), 0.0, 1.0);
    cogl_color_out = texture2D(tex, cogl_tex_coord_in[0].xy) * a;
}
`;

const f = v => v + 1e-4;

const CornerEffect = GObject.registerClass(
class CornerEffect extends Clutter.ShaderEffect {
    _init() {
        super._init();
        this.set_shader_source(CORNERS);
        this.setGeometry(1, 1, 0);
    }

    setGeometry(width, height, radius) {
        this.set_uniform_value('width', f(width));
        this.set_uniform_value('height', f(height));
        this.set_uniform_value('radius', f(Math.min(radius, width / 2, height / 2)));
        this.queue_repaint();
    }
});

// The blur layer under one menu.
class MenuFrost {
    constructor(menu, settings) {
        this._menu = menu;
        this._settings = settings;
        this.actor = new St.Widget({name: 'craftos-menu-frost', reactive: false, visible: false});
        this._blur = new Shell.BlurEffect({mode: Shell.BlurMode.BACKGROUND, brightness: 1.0});
        this.actor.add_effect(this._blur);
        this._corners = new CornerEffect();
        this.actor.add_effect(this._corners);
        this._binding = menu.actor.bind_property('opacity', this.actor, 'opacity',
            GObject.BindingFlags.SYNC_CREATE);
        this._ids = [
            [menu, menu.connect('open-state-changed', (_, open) => this._openChanged(open))],
            [menu.box, menu.box.connect('notify::allocation', () => this._queueUpdate())],
            [menu.actor, menu.actor.connect('notify::allocation', () => this._queueUpdate())],
        ];
    }

    _openChanged(open) {
        if (!open) {
            this.actor.hide();
            return;
        }
        const parent = this._menu.actor.get_parent();
        if (!parent)
            return;
        if (this.actor.get_parent() !== parent) {
            this.actor.get_parent()?.remove_child(this.actor);
            parent.insert_child_below(this.actor, this._menu.actor);
        } else {
            parent.set_child_below_sibling(this.actor, this._menu.actor);
        }
        this.restyle();
        this.actor.show();
        // The menu slides in; follow it until it settles.
        this._follow = 0;
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
            this._update();
            return ++this._follow < 10 && this._menu.isOpen ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
        });
    }

    _queueUpdate() {
        if (this._idle || !this._menu.isOpen)
            return;
        this._idle = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._idle = 0;
            this._update();
            return GLib.SOURCE_REMOVE;
        });
    }

    _update() {
        const box = this._menu.box;
        const parent = this.actor.get_parent();
        if (!box?.mapped || !parent)
            return;
        const [bx, by] = box.get_transformed_position();
        const [w, h] = box.get_transformed_size();
        const [ok, px, py] = parent.transform_stage_point(bx, by);
        this.actor.set_position(ok ? px : bx, ok ? py : by);
        this.actor.set_size(w, h);
        const radius = box.get_theme_node().get_border_radius(St.Corner.TOPLEFT);
        this._corners.setGeometry(w, h, radius);
    }

    restyle() {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._blur.radius = frostRadius(this._settings) * scale;
        const box = this._menu.box;
        box.add_style_class_name('craftos-frosted');
        const alpha = Math.min(0.97, glassAlpha(this._settings));
        box.set_style(`background-color: rgba(250, 250, 252, ${alpha.toFixed(2)});`);
    }

    destroy() {
        if (this._idle)
            GLib.source_remove(this._idle);
        for (const [obj, id] of this._ids) {
            try {
                obj.disconnect(id);
            } catch (e) {}
        }
        this._binding?.unbind();
        const box = this._menu.box;
        if (box) {
            box.remove_style_class_name('craftos-frosted');
            box.set_style(null);
        }
        this.actor.destroy();
    }
}

export class FrostedMenus {
    constructor(settings) {
        this._settings = settings;
    }

    enable() {
        this._frosts = new Map();
        const self = this;
        this._origOpen = PopupMenu.PopupMenu.prototype.open;
        const origOpen = this._origOpen;
        PopupMenu.PopupMenu.prototype.open = function (...args) {
            self._track(this);
            return origOpen.apply(this, args);
        };
        this._settingsIds = [
            this._settings.connect('changed::glass-menus', () => this._clear()),
            this._settings.connect('changed::frost', () => this._restyleAll()),
            this._settings.connect('changed::opacity', () => this._restyleAll()),
        ];
    }

    _track(menu) {
        if (!menu.box || !menu.actor || this._frosts.has(menu) ||
            !this._settings.get_boolean('glass-menus'))
            return;
        this._frosts.set(menu, new MenuFrost(menu, this._settings));
        menu.connect('destroy', () => {
            this._frosts?.get(menu)?.destroy();
            this._frosts?.delete(menu);
        });
    }

    _restyleAll() {
        for (const frost of this._frosts.values())
            frost.restyle();
    }

    // Switched off: drop every layer; switched on: menus pick it up next time
    // they open.
    _clear() {
        for (const frost of this._frosts.values())
            frost.destroy();
        this._frosts.clear();
    }

    disable() {
        PopupMenu.PopupMenu.prototype.open = this._origOpen;
        for (const id of this._settingsIds)
            this._settings.disconnect(id);
        this._clear();
        this._frosts = null;
    }
}
