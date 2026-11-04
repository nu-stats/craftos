// CraftOS glass dock: a frosted glass slab behind the Dash to Dock icons, like
// the macOS dock. A copy of the wallpaper sits behind the dock (same technique
// as Blur My Shell's static blur), is blurred, frosted white, and run through a
// shader that gives the slab a soft, even edge: a faint lens at the rim, a thin
// bright line just inside it and a dark hairline outside, the same all round.
//
// The dock is fixed, so windows never sit behind it and the wallpaper is all
// it needs to show. Blur radius and milkiness follow the Frosted Glass
// sliders (frostRadius / glassAlpha, shared with menus.js and windows.js).
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DockMagnify} from './dock.js';

const SHADER = `
uniform sampler2D tex;
uniform float width;
uniform float height;
uniform float radius;
uniform float bezel;
uniform float tint;

float rounded_box(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + vec2(r);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main(void) {
    vec2 size = vec2(width, height);
    vec2 half_size = size * 0.5;
    vec2 p = cogl_tex_coord_in[0].xy * size - half_size;

    // Signed distance to the slab's edge: negative inside.
    float d = rounded_box(p, half_size, radius);
    vec2 g = vec2(
        rounded_box(p + vec2(1.0, 0.0), half_size, radius) - rounded_box(p - vec2(1.0, 0.0), half_size, radius),
        rounded_box(p + vec2(0.0, 1.0), half_size, radius) - rounded_box(p - vec2(0.0, 1.0), half_size, radius));
    vec2 n = length(g) > 0.0 ? normalize(g) : vec2(0.0);

    // A faint lens over the last "bezel" pixels: the picture is pulled in a
    // little at the rim, the same on every side.
    float t = clamp(1.0 + d / bezel, 0.0, 1.0);
    float bend = t * t;
    vec2 uv = clamp((p - n * bend * bezel * 0.5 + half_size) / size, 0.0, 1.0);
    vec3 col = texture2D(tex, uv).rgb;

    // Frosted white body (the Dock glass slider), a touch brighter at the top.
    col = mix(col, vec3(1.0), tint);
    float y = cogl_tex_coord_in[0].y;
    col += 0.04 * (1.0 - y);

    // A faint bright line just inside the edge, a little brighter along the top,
    // and a dark hairline at the very edge so the outline reads on light
    // wallpapers.
    // (Lines are 1.5px soft, or they stair-step round the corners.)
    col += (1.0 - smoothstep(0.0, 1.5, abs(d + 1.5))) * (0.04 + 0.08 * (1.0 - y));
    col -= (1.0 - smoothstep(0.0, 1.5, abs(d + 0.5))) * 0.14;

    // Anti-aliased rounded shape, premultiplied.
    float a = clamp(0.5 - d, 0.0, 1.0);
    cogl_color_out = vec4(clamp(col, 0.0, 1.0) * a, a);
}
`;


// Uniforms must be floats; whole numbers from JS would be sent as ints.
const f = v => v + 1e-4;

// The Frosted Glass sliders, mapped to blur radius (px) and milkiness, shared
// by the dock, menus and windows so they all match.
export function frostRadius(settings) {
    return Math.round(4 + settings.get_int('frost') * 0.56);
}

export function glassAlpha(settings) {
    return settings.get_int('opacity') / 100;
}

const LiquidGlassEffect = GObject.registerClass(
class LiquidGlassEffect extends Clutter.ShaderEffect {
    _init() {
        super._init();
        this.set_shader_source(SHADER);
        this.setGeometry(1, 1, 16);
        this.set_uniform_value('bezel', f(6));
        this.set_uniform_value('tint', f(0.5));
    }

    setGeometry(width, height, radius) {
        this.set_uniform_value('width', f(width));
        this.set_uniform_value('height', f(height));
        this.set_uniform_value('radius', f(Math.min(radius, width / 2, height / 2)));
        this.queue_repaint();
    }

    setTint(tint) {
        this.set_uniform_value('tint', f(tint));
        this.queue_repaint();
    }
});

// Finds a dock's (transparent) .dash-background.
function dockBackground(container) {
    const dash = container._slider?.get_child()?.get_children()
        .find(c => c.get_name() === 'dash');
    const bg = dash?.get_children().find(c => c.has_style_class_name?.('dash-background'));
    if (!bg)
        throw new Error('Dash to Dock layout not recognised');
    return bg;
}

// Keeps a slab on the dock background's box, widened by `left` and `right`
// px while magnified icons need the room (dock.js). The slab lives just below
// the dock in the shell's top-level group, not inside it: Dash to Dock clips
// its contents to the dock, which would cut a widened slab's ends off square.
class SlabFollower {
    constructor(slab, container, bg, onPlace) {
        this._slab = slab;
        this._container = container;
        this._bg = bg;
        this._onPlace = onPlace;
        this.left = this.right = 0;
        Main.uiGroup.insert_child_below(slab, container);
        this._ids = [
            [bg, bg.connect('notify::allocation', () => this._queue())],
            [bg, bg.connect('notify::mapped', () => this._queue())],
            [container, container.connect('notify::allocation', () => this._queue())],
            [container, container.connect('notify::mapped', () => this._queue())],
            [Main.uiGroup, Main.uiGroup.connect('child-added', () => this._queue())],
        ];
        this.place();
    }

    setSpread(left, right) {
        if (left === this.left && right === this.right)
            return;
        this.left = left;
        this.right = right;
        this.place();
    }

    _queue() {
        if (this._idle)
            return;
        this._idle = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._idle = 0;
            this.place();
            return GLib.SOURCE_REMOVE;
        });
    }

    place() {
        const [bx, by] = this._bg.get_transformed_position();
        const [bw, bh] = this._bg.get_transformed_size();
        this._slab.visible = this._bg.mapped && bw > 0 && bh > 0;
        if (!this._slab.visible)
            return;
        // The shell restacks its top-level group (Dash to Dock re-adds the
        // dock, for one), so keep the slab right under the dock.
        const group = this._slab.get_parent();
        if (group && this._container.get_parent() === group &&
            group.get_children().indexOf(this._slab) > group.get_children().indexOf(this._container))
            group.set_child_below_sibling(this._slab, this._container);
        const x = Math.round(bx - this.left), y = Math.round(by);
        const w = Math.round(bw + this.left + this.right), h = Math.round(bh);
        this._slab.set_position(x, y);
        this._slab.set_size(w, h);
        this._onPlace?.(x, y, w, h);
    }

    destroy() {
        if (this._idle)
            GLib.source_remove(this._idle);
        for (const [obj, id] of this._ids) {
            try {
                obj.disconnect(id);
            } catch (e) {}
        }
    }
}

// One glass slab behind one dock's icons.
class DockGlass {
    constructor(container, look) {
        const bg = dockBackground(container);
        this._monitor = Main.layoutManager.findMonitorForActor(container);
        this.actor = new St.Widget({name: 'craftos-liquid-glass', clip_to_allocation: true, reactive: false});
        this.actor.connect('destroy', () => (this._actorGone = true));
        this._wallpaper = new St.Widget({width: this._monitor.width, height: this._monitor.height});
        this._bgManager = new Background.BackgroundManager({
            container: this._wallpaper,
            monitorIndex: this._monitor.index,
            controlPosition: false,
        });
        this._blur = new Shell.BlurEffect({mode: Shell.BlurMode.ACTOR, brightness: 1.0});
        this._wallpaper.add_effect(this._blur);
        this.actor.add_child(this._wallpaper);
        this._glass = new LiquidGlassEffect();
        this.actor.add_effect(this._glass);
        this.setLook(look);
        this._follower = new SlabFollower(this.actor, container, bg,
            (x, y, w, h) => this._placed(x, y, w, h));
        this._destroyId = container.connect('destroy', () => this.destroy());
    }

    // look: {radius, milk} from the Frosted Glass sliders: frost thickness and
    // the dock's own "Dock glass" slider (0 clear .. 1 frosted white).
    setLook(look) {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        // Light frost: what is behind stays readable, softened, as on macOS.
        this._blur.radius = Math.round(look.radius * 0.4) * scale;
        this._glass.setTint(0.12 + 0.4 * look.milk);
    }

    setSpread(left, right) {
        this._follower.setSpread(left, right);
    }

    _placed(x, y, w, h) {
        this._wallpaper.set_position(-(x - this._monitor.x), -(y - this._monitor.y));
        // Half-round ends: one smooth curve, not a box with rounded corners
        // (any straight stretch at the ends makes them look blocky).
        this._glass.setGeometry(w, h, h / 2);
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._follower.destroy();
        this._bgManager?.destroy();
        if (!this._actorGone)
            this.actor.destroy();
    }
}

// With the glass switched off: a plain light slab in the same place. It is our
// own actor because Dash to Dock styles its background inline, which no
// stylesheet rule can override.
class PlainDock {
    constructor(container) {
        this.actor = new St.Widget({style_class: 'craftos-plain-dock', reactive: false});
        this.actor.connect('destroy', () => (this._actorGone = true));
        this._follower = new SlabFollower(this.actor, container, dockBackground(container));
        this._destroyId = container.connect('destroy', () => this.destroy());
    }

    setLook(_look) {}

    setSpread(left, right) {
        this._follower.setSpread(left, right);
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._follower.destroy();
        if (!this._actorGone)
            this.actor.destroy();
    }
}

// Finds Dash to Dock's docks (now and when they are recreated) and gives each
// a glass slab while the Frosted Glass "dock" switch is on, or a plain light
// one while it is off. Dash to Dock's own background is transparent (CraftOS
// dconf defaults).
export class LiquidGlass {
    constructor(settings) {
        this._settings = settings;
    }

    enable() {
        this._docks = new Map();
        this._magnifiers = new Map();
        this._childAddedId = Main.uiGroup.connect('child-added', (_, actor) => this._try(actor));
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._rebuild());
        this._settingsIds = [
            this._settings.connect('changed::glass-dock', () => this._rebuild()),
            this._settings.connect('changed::frost', () => this._restyle()),
            this._settings.connect('changed::dock-glass', () => this._restyle()),
        ];
        // Dash to Dock may start after this extension.
        this._retry = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this._scan();
            return GLib.SOURCE_CONTINUE;
        });
        this._scan();
    }

    _look() {
        return {radius: frostRadius(this._settings), milk: this._settings.get_int('dock-glass') / 100};
    }

    _scan() {
        for (const child of Main.uiGroup.get_children())
            this._try(child);
    }

    _try(actor) {
        if (actor.get_name?.() !== 'dashtodockContainer' || this._docks.has(actor))
            return;
        try {
            this._docks.set(actor, this._settings.get_boolean('glass-dock')
                ? new DockGlass(actor, this._look()) : new PlainDock(actor));
            if (!this._magnifiers.has(actor)) {
                // The magnifier outlives slab rebuilds; it widens whichever
                // slab the dock has now.
                this._magnifiers.set(actor, new DockMagnify(actor, this._settings,
                    (left, right) => this._docks?.get(actor)?.setSpread(left, right)));
                actor.connect('destroy', () => {
                    this._docks?.delete(actor);
                    this._magnifiers?.get(actor)?.destroy();
                    this._magnifiers?.delete(actor);
                });
            }
        } catch (e) {
            // Not laid out yet; the next scan tries again.
        }
    }

    _restyle() {
        for (const glass of this._docks.values())
            glass.setLook(this._look());
    }

    _rebuild() {
        for (const glass of this._docks.values())
            glass.destroy();
        this._docks.clear();
        this._scan();
    }

    disable() {
        if (this._retry)
            GLib.source_remove(this._retry);
        Main.uiGroup.disconnect(this._childAddedId);
        Main.layoutManager.disconnect(this._monitorsId);
        for (const id of this._settingsIds)
            this._settings.disconnect(id);
        for (const glass of this._docks.values())
            glass.destroy();
        this._docks = null;
        for (const magnifier of this._magnifiers.values())
            magnifier.destroy();
        this._magnifiers = null;
    }
}
