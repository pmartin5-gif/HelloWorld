"""Abstract cosmic particle transport. Run: python cosmic_particles.py.

All visuals are generated in code; no asset paths are required. Forces and
lengths are illustrative visual units, not a quantitative astrophysics model.
"""

import math
import random
import time

import py5


WIDTH, HEIGHT = 1200, 800
PARTICLES_PER_TYPE = 400  # 1,200 particles in one simultaneous burst
SIMULATION_SPEED = 0.075  # Half the previous pace
COLORS = {
    "proton": (196, 112, 49),
    "photon": (32, 145, 158),
    "neutrino": (134, 102, 191),
}
SPEEDS = {"proton": 2.5, "photon": 4.3, "neutrino": 4.2}

# Three abstract elements: gravity (empty ring), dust (hatching), magnetism (X).
# Randomized positions, radii, strength, and symbol styles for each burst.
GRAVITY = (350, 280, 100, 1.8)
DUST = (640, 450, 95)
MAGNET = (940, 270, 110)
ORIGIN_MARGIN = 160
ORIGIN = (WIDTH / 2, HEIGHT / 2)  # Randomized at startup and on R.

particles = []
environment = None
trail_layer = None
element_styles = {}
paused = False
last_time = None


def rotate_velocity(particle, angle):
    c, s = math.cos(angle), math.sin(angle)
    vx, vy = particle.vx, particle.vy
    particle.vx = c * vx - s * vy
    particle.vy = s * vx + c * vy


def chance(rate, dt):
    """Convert a per-step collision chance to the current time step."""
    return random.random() < 1 - (1 - rate) ** dt


class Particle:
    __slots__ = ("kind", "angle", "x", "y", "vx", "vy", "active",
                 )

    def __init__(self, kind, angle):
        self.kind = kind
        self.angle = angle
        self.x, self.y = ORIGIN
        speed = SPEEDS[self.kind]
        self.vx = speed * math.cos(self.angle)
        self.vy = speed * math.sin(self.angle)
        self.active = True

    def update(self, dt):
        if not self.active:
            return
        gx, gy, radius, mass = GRAVITY
        dx, dy = gx - self.x, gy - self.y
        # Softened gravity also qualitatively bends the neutral particles.
        force = 2300 * mass / (dx * dx + dy * dy + (radius * 0.6)**2) ** 1.5
        self.vx += dx * force * dt
        self.vy += dy * force * dt

        mx, my, field_radius = MAGNET
        distance_squared = (self.x - mx)**2 + (self.y - my)**2
        if self.kind == "proton" and distance_squared < field_radius**2:
            strength = (1 - distance_squared / field_radius**2) ** 2
            rotate_velocity(self, 0.055 * strength * dt)

        cx, cy, dust_radius = DUST
        density = 1 - ((self.x - cx)**2 + (self.y - cy)**2) / dust_radius**2
        if density > 0:
            if self.kind == "proton":
                drag = (1 - 0.012 * density) ** dt
                self.vx *= drag
                self.vy *= drag
                if chance(0.04 * density, dt):
                    rotate_velocity(self, random.gauss(0, 0.22))
            elif self.kind == "photon":
                if chance(0.006 * density, dt):
                    # Stop motion on absorption; its drawn path stays on the canvas.
                    self.active = False
                    return
                if chance(0.028 * density, dt):
                    rotate_velocity(self, random.gauss(0, 0.45))
            # Neutrinos pass through dust and the magnetic field.

        speed = math.hypot(self.vx, self.vy)
        target = min(speed, 6.0) if self.kind == "proton" else SPEEDS[self.kind]
        if speed > 1e-12:
            self.vx *= target / speed
            self.vy *= target / speed
        self.x += self.vx * dt
        self.y += self.vy * dt

        if (self.x < -35 or self.x > WIDTH + 35 or self.y < -35
                or self.y > HEIGHT + 35):
            # Particles that leave the canvas are never replaced.
            self.active = False
            return



def choose_origin():
    # Leave room for an expanding burst and avoid starting inside an element.
    for _ in range(1000):
        x = random.uniform(ORIGIN_MARGIN, WIDTH - ORIGIN_MARGIN)
        y = random.uniform(ORIGIN_MARGIN, HEIGHT - ORIGIN_MARGIN)
        if all(math.hypot(x - cx, y - cy) > radius + 35
               for cx, cy, radius in (GRAVITY[:3], DUST, MAGNET)):
            return x, y
    return WIDTH / 2, HEIGHT - ORIGIN_MARGIN


def reset_particles():
    global ORIGIN, last_time
    randomize_elements()
    build_environment()
    ORIGIN = choose_origin()
    trail_layer.begin_draw()
    trail_layer.clear()
    trail_layer.end_draw()
    # The only particle creation happens here: startup or an explicit R.
    particles.clear()
    rotation = random.uniform(0, math.tau)
    spacing = math.tau / PARTICLES_PER_TYPE
    for kind_index, kind in enumerate(COLORS):
        # Each species covers exactly 360 degrees with equal angular spacing.
        # Interleave the colors so the initial lines do not all overlap.
        offset = rotation + kind_index * spacing / len(COLORS)
        particles.extend(Particle(kind, offset + index * spacing)
                         for index in range(PARTICLES_PER_TYPE))
    last_time = time.perf_counter()


def randomize_elements():
    global GRAVITY, DUST, MAGNET, element_styles
    circles = []
    defaults = [(350, 280), (640, 450), (940, 270)]
    for index in range(3):
        radius = random.uniform(65, 110)
        for _ in range(500):
            x = random.uniform(radius + 45, WIDTH - radius - 45)
            y = random.uniform(radius + 45, HEIGHT - radius - 45)
            if all(math.hypot(x - cx, y - cy) > radius + other + 45
                   for cx, cy, other in circles):
                break
        else:
            x, y = defaults[index]
        circles.append((x, y, radius))
    GRAVITY = (*circles[0], random.uniform(1.1, 2.4))
    DUST, MAGNET = circles[1:]
    element_styles = {
        "rings": random.randint(1, 3),
        "hatch_spacing": random.randint(14, 24),
        "hatch_angle": random.uniform(0, math.tau),
        "crosshatch": random.choice((True, False)),
        "magnet_angle": random.uniform(0, math.tau),
        "magnet_symbols": random.choice((1, 3)),
        "weight": random.uniform(0.8, 1.5),
    }


def build_environment():
    """Cache the randomized white canvas and three unshaded symbols."""
    global environment
    if environment is None:
        environment = py5.create_graphics(WIDTH, HEIGHT)
    g = environment
    g.begin_draw()
    g.background(255)
    g.no_fill()
    g.stroke_weight(element_styles["weight"])

    gx, gy, radius, _ = GRAVITY
    g.stroke(135, 145, 165, 145)
    g.circle(gx, gy, radius * 2)
    for index in range(1, element_styles["rings"]):
        g.circle(gx, gy, radius * 2 * (1 - index * 0.18))

    cx, cy, radius = DUST
    g.stroke(151, 132, 161, 125)
    g.circle(cx, cy, radius * 2)
    g.push_matrix()
    g.translate(cx, cy)
    g.rotate(element_styles["hatch_angle"])
    root_two = math.sqrt(2)
    inner_radius = radius - 8
    spacing = element_styles["hatch_spacing"]
    extent = int(inner_radius // spacing)
    slopes = (-1, 1) if element_styles["crosshatch"] else (1,)
    for index in range(-extent, extent + 1):
        offset = index * spacing
        half_chord = math.sqrt(max(0, inner_radius**2 - offset**2))
        for slope in slopes:
            nx, ny = -slope / root_two, 1 / root_two
            ux, uy = 1 / root_two, slope / root_two
            x, y = offset * nx, offset * ny
            g.line(x - half_chord * ux, y - half_chord * uy,
                   x + half_chord * ux, y + half_chord * uy)
    g.pop_matrix()

    mx, my, radius = MAGNET
    g.stroke(106, 153, 150, 145)
    g.circle(mx, my, radius * 2)
    g.push_matrix()
    g.translate(mx, my)
    g.rotate(element_styles["magnet_angle"])
    offsets = (0,) if element_styles["magnet_symbols"] == 1 else (-30, 0, 30)
    for offset in offsets:
        g.line(offset - 9, -9, offset + 9, 9)
        g.line(offset - 9, 9, offset + 9, -9)
    g.pop_matrix()
    g.end_draw()


def setup():
    global trail_layer
    py5.size(WIDTH, HEIGHT)
    py5.smooth()
    py5.frame_rate(60)
    py5.window_title("Cosmic passage")
    trail_layer = py5.create_graphics(WIDTH, HEIGHT)
    reset_particles()


def draw():
    global last_time
    now = time.perf_counter()
    elapsed = min(max(now - last_time, 0), 0.1)
    last_time = now
    if not paused:
        remaining = elapsed * 60 * SIMULATION_SPEED
        trail_layer.begin_draw()
        trail_layer.no_fill()
        trail_layer.stroke_weight(1)
        # Draw only each new segment into a persistent transparent layer.
        # Never clear it during a burst: every full path remains visible,
        # including paths of absorbed or off-canvas particles. This avoids
        # redrawing thousands of increasingly long paths every frame.
        while remaining > 1e-9:
            dt = min(remaining, 0.25)
            for group, color in enumerate(COLORS.values()):
                trail_layer.stroke(*color, 150)
                start = group * PARTICLES_PER_TYPE
                for index in range(start, start + PARTICLES_PER_TYPE):
                    particle = particles[index]
                    if particle.active:
                        x, y = particle.x, particle.y
                        particle.update(dt)
                        if (particle.x, particle.y) != (x, y):
                            trail_layer.line(x, y, particle.x, particle.y)
            remaining -= dt
        trail_layer.end_draw()

    py5.image(environment, 0, 0)
    py5.image(trail_layer, 0, 0)


def key_pressed():
    global paused, last_time
    key = str(py5.key).lower()
    if key == " ":
        paused = not paused
        last_time = time.perf_counter()
    elif key == "r":
        reset_particles()


if __name__ == "__main__":
    py5.run_sketch()
