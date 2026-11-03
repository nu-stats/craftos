// CraftOS "liquid glass" dock: a lens-like glass slab behind the Dash to Dock
// icons, in the spirit of macOS 26. A copy of the wallpaper sits behind the
// dock (same technique as Blur My Shell's static blur), is blurred, and is run
// through a shader that bends it near the edges like thick glass, splits the
// colours slightly at the rim, brightens it, and draws a specular edge
// highlight that turns toward the pointer.
//
// The dock is fixed, so windows never sit behind it and the wallpaper is all
// it needs to refract. Blur radius and milkiness follow the Frosted Glass
// sliders (frostRadius / glassAlpha, shared with menus.js and windows.js).
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SHADER = `
uniform sampler2D tex;
uniform float width;
uniform float height;
uniform float radius;
uniform float bezel;
uniform float light_x;
uniform float light_y;
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

    // Clear glass is seen by what it does to the picture behind it, not by a
    // tint. The whole slab magnifies a little (lines inside do not meet the
    // ones outside), and over the last "bezel" pixels the lens curves, pulling
    // the picture strongly inward, like the rounded edge of thick glass.
    float t = clamp(1.0 + d / bezel, 0.0, 1.0);
    float bend = t * t * t;
    vec2 off = -n * bend * bezel * 1.6;
    vec2 q = p * 0.88;

    // Colour split at the rim (dispersion).
    vec2 uv_r = clamp((q + off * 1.25 + half_size) / size, 0.0, 1.0);
    vec2 uv_g = clamp((q + off + half_size) / size, 0.0, 1.0);
    vec2 uv_b = clamp((q + off * 0.75 + half_size) / size, 0.0, 1.0);
    vec3 col = vec3(texture2D(tex, uv_r).r, texture2D(tex, uv_g).g, texture2D(tex, uv_b).b);

    // Glass makes what is behind it more vivid.
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(luma), col, 1.6);

    // Milky body (the Dock glass slider), with a soft sheen across the top.
    col = mix(col, vec3(1.0), tint);
    float y = cogl_tex_coord_in[0].y;
    col += (0.05 + 0.08 * tint) * (1.0 - smoothstep(0.0, 0.5, y));

    // The curved edge catches light on the side facing it and falls into
    // shade on the other, so the slab's thickness shows on any wallpaper.
    vec2 L = normalize(vec2(light_x, light_y));
    float facing = dot(n, L);
    col += bend * 0.30 * max(facing, 0.0);
    col *= 1.0 - bend * 0.22 * (1.0 - max(facing, 0.0));

    // Specular highlight along the rim, brightest facing the light, plus a
    // thin bright line just inside the edge all the way round.
    float rim = 1.0 - smoothstep(0.0, 2.0, abs(d + 1.0));
    col += rim * (0.95 * max(facing, 0.0) + 0.45 * max(-facing, 0.0));
    // (Lines are 1.5px soft, or they stair-step round the corners.)
    col += (1.0 - smoothstep(0.0, 1.5, abs(d + 3.0))) * 0.24;

    // A dark hairline at the very edge, so the outline reads on light
    // wallpapers.
    col -= (1.0 - smoothstep(0.0, 1.5, abs(d + 0.6))) * 0.18;

    // Anti-aliased rounded shape, premultiplied.
    float a = clamp(0.5 - d, 0.0, 1.0);
    cogl_color_out = vec4(min(col, vec3(1.0)) * a, a);
}
`;

// Corner radius of the dock slab, in logical px; rounder than the lens bezel
// is deep, so the edge shading follows a curve, not a squarish corner.
const DOCK_RADIUS = 26;

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
        this.setLight(-0.35, -1);
        this.set_uniform_value('bezel', f(22));
        this.set_uniform_value('tint', f(0.22));
    }

    setGeometry(width, height, radius) {
        this.set_uniform_value('width', f(width));
        this.set_uniform_value('height', f(height));
        this.set_uniform_value('radius', f(Math.min(radius, width / 2, height / 2)));
        this.queue_repaint();
    }

    setLight(x, y) {
        this.set_uniform_value('light_x', f(x));
        this.set_uniform_value('light_y', f(y));
        this.queue_repaint();
    }

    setTint(tint) {
        this.set_uniform_value('tint', f(tint));
        this.queue_repaint();
    }
});

// The slab takes no room in the dock's layout (otherwise the dock would grow
// to fit it); a BindConstraint gives it the dock background's exact box.
const GlassSlab = GObject.registerClass(
class GlassSlab extends St.Widget {
    vfunc_get_preferred_width(_forHeight) {
        return [0, 0];
    }

    vfunc_get_preferred_height(_forWidth) {
        return [0, 0];
    }
});

// One glass slab behind one dock's icons. It sits in Dash to Dock's dash just
// above the (transparent) .dash-background, which keeps its shadow underneath.
class DockGlass {
    constructor(container, look) {
        this._container = container;
        const dashBox = container._slider?.get_child();
        this._dash = dashBox?.get_children().find(c => c.get_name() === 'dash');
        this._dashBackground = this._dash?.get_children()
            .find(c => c.has_style_class_name?.('dash-background'));
        if (!dashBox || !this._dash || !this._dashBackground)
            throw new Error('Dash to Dock layout not recognised');

        this._monitor = Main.layoutManager.findMonitorForActor(container);
        this.actor = new GlassSlab({name: 'craftos-liquid-glass', clip_to_allocation: true, reactive: false});
        this.actor.connect('destroy', () => (this._actorGone = true));
        this.actor.add_constraint(new Clutter.BindConstraint({
            source: this._dashBackground, coordinate: Clutter.BindCoordinate.ALL,
        }));
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
        this._dash.insert_child_above(this.actor, this._dashBackground);

        this._ids = [
            [this._dashBackground, this._dashBackground.connect('notify::allocation', () => this._queueUpdate())],
            [this._dash, this._dash.connect('notify::allocation', () => this._queueUpdate())],
            [container, container.connect('notify::allocation', () => this._queueUpdate())],
            [container, container.connect('destroy', () => this.destroy())],
        ];
        this._update();

        // Move the highlight toward the pointer, a few times a second.
        this._lastLight = null;
        this._lightTimer = GLib.timeout_add(GLib.PRIORITY_LOW, 80, () => {
            this._updateLight();
            return GLib.SOURCE_CONTINUE;
        });
    }

    // look: {radius, milk} from the Frosted Glass sliders: frost thickness and
    // the dock's own "Dock glass" slider (0 clear .. 1 frosted white).
    setLook(look) {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        // Clear glass blurs little, so the wallpaper reads through it.
        this._blur.radius = Math.round(look.radius * 0.6 * (0.3 + 0.7 * look.milk)) * scale;
        this._glass.setTint(look.milk);
    }

    _queueUpdate() {
        if (this._updateIdle)
            return;
        this._updateIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._updateIdle = 0;
            this._update();
            return GLib.SOURCE_REMOVE;
        });
    }

    _update() {
        const bg = this._dashBackground;
        const [w, h] = bg.get_size();
        if (w <= 0 || h <= 0)
            return;

        const [tx, ty] = bg.get_transformed_position();
        this._wallpaper.set_position(-(tx - this._monitor.x), -(ty - this._monitor.y));

        const node = bg.get_theme_node();
        // At least as round as the lens bezel is deep; a tighter corner makes
        // the edge shading turn square and the dock's ends look blocky.
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const radius = Math.max(node.get_border_radius(St.Corner.TOPLEFT), DOCK_RADIUS * scale);
        this._glass.setGeometry(w, h, radius);
        this._center = [tx + w / 2, ty + h / 2];
    }

    _updateLight() {
        if (!this._center || !this.actor.mapped)
            return;
        const [px] = global.get_pointer();
        const dx = Math.max(-1, Math.min(1, (px - this._center[0]) / (this._monitor.width / 2)));
        const light = Math.round(dx * 20) / 20;
        if (light === this._lastLight)
            return;
        this._lastLight = light;
        this._glass.setLight(light * 0.9, -1);
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        if (this._lightTimer)
            GLib.source_remove(this._lightTimer);
        if (this._updateIdle)
            GLib.source_remove(this._updateIdle);
        for (const [obj, id] of this._ids) {
            try {
                obj.disconnect(id);
            } catch (e) {}
        }
        this._bgManager?.destroy();
        // When Dash to Dock rebuilds a dock it destroys the slab with it.
        if (!this._actorGone)
            this.actor.destroy();
    }
}

// With the glass switched off: a plain light slab in the same place. It is our
// own actor because Dash to Dock styles its background inline, which no
// stylesheet rule can override.
class PlainDock {
    constructor(container) {
        const dash = container._slider?.get_child()?.get_children()
            .find(c => c.get_name() === 'dash');
        const bg = dash?.get_children().find(c => c.has_style_class_name?.('dash-background'));
        if (!bg)
            throw new Error('Dash to Dock layout not recognised');
        this.actor = new GlassSlab({style_class: 'craftos-plain-dock', reactive: false});
        this.actor.connect('destroy', () => (this._actorGone = true));
        this.actor.add_constraint(new Clutter.BindConstraint({
            source: bg, coordinate: Clutter.BindCoordinate.ALL,
        }));
        dash.insert_child_above(this.actor, bg);
    }

    setLook(_look) {}

    destroy() {
        if (!this._actorGone)
            this.actor.destroy();
        this._actorGone = true;
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
            actor.connect('destroy', () => this._docks?.delete(actor));
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
    }
}
