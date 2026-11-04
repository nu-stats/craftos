// CraftOS dock size and macOS-style magnification.
//
// Size: the Settings > Frosted Glass "Dock size" slider sets Dash to Dock's
// icon size.
//
// Magnification: while the pointer is over the dock, the icons near it grow
// and their neighbours move apart, as on macOS. Dash to Dock clips its icons
// to the dock, so the big icons are our own, drawn in a layer above it at the
// largest size and scaled down (so they stay sharp); the dock's own icons are
// hidden meanwhile but stay where they are, so clicks, running dots and
// tooltips keep working. The point under the pointer never moves, so a click
// always lands on the icon under it. The glass slab widens to fit.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const DTD = 'org.gnome.shell.extensions.dash-to-dock';

// How far the bulge reaches, in icon slots either side of the pointer.
const REACH = 2.6;
// Ease in and out per frame (0..1).
const RAMP = 0.18;

export function dashOf(container) {
    return container._slider?.get_child()?.get_children()
        .find(c => c.get_name() === 'dash') ?? null;
}

function iconOf(item) {
    const icon = item.child?.icon?.icon ?? item.icon?.icon;
    return icon instanceof St.Icon ? icon : null;
}

// One dock's magnifier. spread(left, right) widens the glass under it.
export class DockMagnify {
    constructor(container, settings, spread) {
        this._container = container;
        this._settings = settings;
        this._spread = spread;
        this._dash = dashOf(container);
        if (!this._dash)
            throw new Error('Dash to Dock layout not recognised');
        this._copies = new Map();
        this._labels = new Set();
        this._strength = 0;
        // Dash to Dock does not pass pointer events on to us, so look for the
        // pointer over the dock a few times a second (cheap), and run frames
        // only while it is there.
        this._watch = GLib.timeout_add(GLib.PRIORITY_LOW, 100, () => {
            if (!this._tick && this._settings.get_int('dock-magnify') > 0 && this._pointerOver())
                this._start();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _background() {
        return this._dash.get_children().find(c => c.has_style_class_name?.('dash-background')) ?? null;
    }

    _pointerOver() {
        const bg = this._background();
        if (!bg || !this._container.mapped)
            return false;
        const [px, py] = global.get_pointer();
        const [bx, by] = bg.get_transformed_position();
        const [bw, bh] = bg.get_transformed_size();
        const left = this._left ?? 0, right = this._right ?? 0;
        return px >= bx - left && px <= bx + bw + right && py >= by - 8 && py <= by + bh;
    }

    _start() {
        this._layer = new St.Widget({reactive: false});
        Main.uiGroup.add_child(this._layer);
        this._tick = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => this._frame());
    }

    // The dock's icons, left to right.
    _icons() {
        const items = [];
        const walk = actor => {
            for (const child of actor.get_children()) {
                const icon = iconOf(child);
                if (icon) {
                    if (icon.mapped)
                        items.push({icon, label: child.label ?? null});
                } else if (child.get_n_children?.() && !(child instanceof St.Icon)) {
                    walk(child);
                }
            }
        };
        walk(this._dash);
        return items
            .map(({icon, label}) => {
                const [x, y] = icon.get_transformed_position();
                const [w, h] = icon.get_transformed_size();
                return {icon, label, c: x + w / 2, w, h, bottom: y + h};
            })
            .sort((a, b) => a.c - b.c);
    }

    _frame() {
        const mag = 1 + this._settings.get_int('dock-magnify') / 100;
        const icons = this._icons();
        if (!this._background() || icons.length === 0 || !this._container.mapped) {
            this._stop();
            return GLib.SOURCE_REMOVE;
        }

        const inside = this._pointerOver();
        if (inside)
            this._px = global.get_pointer()[0];
        this._strength = Math.max(0, Math.min(1, this._strength + (inside ? RAMP : -RAMP)));
        if (this._strength === 0 && !inside) {
            this._stop();
            return GLib.SOURCE_REMOVE;
        }

        const slot = icons.length > 1
            ? (icons[icons.length - 1].c - icons[0].c) / (icons.length - 1) : icons[0].w;
        const reach = REACH * slot;
        for (const it of icons) {
            const d = Math.min(Math.abs(it.c - this._px) / reach, 1);
            it.scale = 1 + (mag - 1) * this._strength * (Math.cos(Math.PI * d) + 1) / 2;
            it.extra = (it.scale - 1) * slot;
        }

        // Lay the icons out with their extra widths, then shift everything so
        // the point under the pointer stays put.
        let k = 0;
        for (let i = 1; i < icons.length; i++) {
            if (Math.abs(icons[i].c - this._px) < Math.abs(icons[k].c - this._px))
                k = i;
        }
        let before = 0;
        for (let i = 0; i < k; i++)
            before += icons[i].extra;
        const frac = Math.max(-0.5, Math.min(0.5, (this._px - icons[k].c) / slot));
        const anchor = before + icons[k].extra * (0.5 + frac);
        const total = icons.reduce((sum, it) => sum + it.extra, 0);

        let run = 0;
        for (const it of icons) {
            const shift = run + it.extra / 2 - anchor;
            run += it.extra;
            const copy = this._copy(it.icon, mag);
            const [cw, ch] = copy.get_size();
            copy.set_scale(it.scale / mag, it.scale / mag);
            copy.set_position(Math.round(it.c + shift - cw / 2), Math.round(it.bottom - ch));
            it.icon.opacity = 0;
            // Its tooltip follows it up and over, so it never covers it.
            if (it.label) {
                it.label.translation_x = Math.round(shift);
                it.label.translation_y = -Math.round((it.scale - 1) * it.h);
                this._labels.add(it.label);
            }
        }
        this._left = anchor;
        this._right = total - anchor;
        this._spread(this._left, this._right);
        return GLib.SOURCE_CONTINUE;
    }

    // A sharp copy of a dock icon at the largest size.
    _copy(icon, mag) {
        let copy = this._copies.get(icon);
        const size = Math.round(icon.icon_size * mag);
        if (!copy || copy.icon_size !== size) {
            copy?.destroy();
            copy = new St.Icon({
                gicon: icon.gicon, icon_size: size,
                style: 'color: #1d1d1f;', reactive: false,
            });
            copy.set_pivot_point(0.5, 1);
            this._layer.add_child(copy);
            this._copies.set(icon, copy);
            icon.connect('destroy', () => {
                this._copies.get(icon)?.destroy();
                this._copies.delete(icon);
            });
        }
        return copy;
    }

    _stop() {
        if (this._tick)
            GLib.source_remove(this._tick);
        this._tick = 0;
        for (const it of this._icons())
            it.icon.opacity = 255;
        for (const icon of this._copies.keys())
            icon.opacity = 255;
        this._copies.clear();
        for (const label of this._labels) {
            try {
                label.translation_x = label.translation_y = 0;
            } catch (e) {}
        }
        this._labels.clear();
        this._layer?.destroy();
        this._layer = null;
        this._strength = 0;
        this._left = this._right = 0;
        this._spread(0, 0);
    }

    destroy() {
        if (this._watch)
            GLib.source_remove(this._watch);
        this._watch = 0;
        this._stop();
    }
}

// Keeps Dash to Dock's icon size on the Dock size slider.
export class DockSize {
    constructor(settings) {
        this._settings = settings;
    }

    enable() {
        // (A missing schema would abort the shell, so look it up first.)
        const schema = Gio.SettingsSchemaSource.get_default().lookup(DTD, true);
        this._dtd = schema ? new Gio.Settings({settings_schema: schema}) : null;
        this._id = this._settings.connect('changed::dock-size', () => this._sync());
        this._sync();
    }

    _sync() {
        const size = this._settings.get_int('dock-size');
        if (this._dtd && this._dtd.get_int('dash-max-icon-size') !== size)
            this._dtd.set_int('dash-max-icon-size', size);
    }

    disable() {
        this._settings.disconnect(this._id);
        this._dtd = null;
    }
}
