// CraftOS "liquid glass" dock: a lens-like glass slab behind the Dash to Dock
// icons, in the spirit of macOS 26. A copy of the wallpaper sits behind the
// dock (same technique as Blur My Shell's static blur), is blurred, and is run
// through a shader that bends it near the edges like thick glass, splits the
// colours slightly at the rim, brightens it, and draws a specular edge
// highlight that turns toward the pointer.
//
// Limits: it refracts the wallpaper, not the windows behind the dock (like
// Blur My Shell's static mode), and only the dock gets it.
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

    // Lens: flat in the middle, curving over the last "bezel" pixels, so the
    // edge pulls the picture inward (magnified and bent, like thick glass).
    float t = clamp(1.0 + d / bezel, 0.0, 1.0);
    float bend = t * t * t;
    vec2 off = -n * bend * bezel * 0.85;

    // Slight colour split at the rim (dispersion).
    vec2 uv_r = clamp((p + off * 1.10 + half_size) / size, 0.0, 1.0);
    vec2 uv_g = clamp((p + off + half_size) / size, 0.0, 1.0);
    vec2 uv_b = clamp((p + off * 0.90 + half_size) / size, 0.0, 1.0);
    vec3 col = vec3(texture2D(tex, uv_r).r, texture2D(tex, uv_g).g, texture2D(tex, uv_b).b);

    // Milky body, a little brighter toward the curved edge.
    col = mix(col, vec3(1.0), tint);
    col += bend * 0.10;

    // Specular highlight along the rim, brightest on the side facing the
    // light, with a faint reflection on the opposite side.
    vec2 L = normalize(vec2(light_x, light_y));
    float rim = 1.0 - smoothstep(0.0, 2.5, abs(d + 1.25));
    float facing = dot(n, L);
    col += rim * (0.70 * max(facing, 0.0) + 0.22 * max(-facing, 0.0));

    // Anti-aliased rounded shape, premultiplied.
    float a = clamp(0.5 - d, 0.0, 1.0);
    cogl_color_out = vec4(min(col, vec3(1.0)) * a, a);
}
`;

// Uniforms must be floats; whole numbers from JS would be sent as ints.
const f = v => v + 1e-4;

const LiquidGlassEffect = GObject.registerClass(
class LiquidGlassEffect extends Clutter.ShaderEffect {
    _init() {
        super._init();
        this.set_shader_source(SHADER);
        this.setGeometry(1, 1, 16);
        this.setLight(-0.35, -1);
        this.set_uniform_value('bezel', f(14));
        this.set_uniform_value('tint', f(0.28));
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
});

// One glass slab behind one dock.
class DockGlass {
    constructor(container) {
        this._container = container;
        const dashBox = container._slider?.get_child();
        this._dash = dashBox?.get_children().find(c => c.get_name() === 'dash');
        this._dashBackground = this._dash?.get_children()
            .find(c => c.has_style_class_name?.('dash-background'));
        if (!dashBox || !this._dash || !this._dashBackground)
            throw new Error('Dash to Dock layout not recognised');
        this._dashBox = dashBox;

        this._monitor = Main.layoutManager.findMonitorForActor(container);
        this.actor = new St.Widget({name: 'craftos-liquid-glass', clip_to_allocation: true, reactive: false});
        this._wallpaper = new St.Widget({width: this._monitor.width, height: this._monitor.height});
        this._bgManager = new Background.BackgroundManager({
            container: this._wallpaper,
            monitorIndex: this._monitor.index,
            controlPosition: false,
        });
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._wallpaper.add_effect(new Shell.BlurEffect({
            mode: Shell.BlurMode.ACTOR, radius: 18 * scale, brightness: 1.0,
        }));
        this.actor.add_child(this._wallpaper);
        this._glass = new LiquidGlassEffect();
        this.actor.add_effect(this._glass);
        dashBox.insert_child_at_index(this.actor, 0);

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
        this.actor.set_position(this._dash.x + bg.x, this._dash.y + bg.y);
        this.actor.set_size(w, h);

        const [tx, ty] = bg.get_transformed_position();
        this._wallpaper.set_position(-(tx - this._monitor.x), -(ty - this._monitor.y));

        const node = bg.get_theme_node();
        const radius = node.get_border_radius(St.Corner.TOPLEFT) || 18;
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
        this.actor.destroy();
    }
}

// Finds Dash to Dock's docks (now and when they are recreated) and gives each
// a glass slab. Dash to Dock's own background is made transparent in the
// CraftOS dconf defaults so the glass shows through.
export class LiquidGlass {
    enable() {
        this._docks = new Map();
        this._childAddedId = Main.uiGroup.connect('child-added', (_, actor) => this._try(actor));
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._rebuild());
        // Dash to Dock may start after this extension.
        this._retry = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this._scan();
            return GLib.SOURCE_CONTINUE;
        });
        this._scan();
    }

    _scan() {
        for (const child of Main.uiGroup.get_children())
            this._try(child);
    }

    _try(actor) {
        if (actor.get_name?.() !== 'dashtodockContainer' || this._docks.has(actor))
            return;
        try {
            this._docks.set(actor, new DockGlass(actor));
            actor.connect('destroy', () => this._docks.delete(actor));
        } catch (e) {
            // Not laid out yet; the next scan tries again.
        }
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
        for (const glass of this._docks.values())
            glass.destroy();
        this._docks = null;
    }
}
