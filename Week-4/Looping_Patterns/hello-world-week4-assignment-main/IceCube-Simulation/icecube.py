"""South Pole particle transport, illustrated with py5.

Run: python icecube.py. Space pauses, R starts a new wave, H toggles annotations.
This is a qualitative model, not a calibrated particle-transport calculation.
"""

import math
import random
import time

import py5


WIDTH, HEIGHT = 1200, 900
SURFACE = 250
ICE_BOTTOM = 845
ICE_DEPTH_METERS = 2800
PARTICLES_PER_TYPE = 300
SIMULATION_SPEED = 0.22
TRANSPORT_SPEED = 3.2  # Shared display speed: penetration is not about speed.
NEUTRINO_INTERACTION_FRACTION = 0.015  # Deliberately amplified for visibility.
COLORS = {
    "proton": (196, 112, 49),
    "photon": (32, 145, 158),
    "neutrino": (134, 102, 191),
    "muon": (78, 107, 137),
}

primaries = []
secondaries = []
events = []
sensors = []
sensor_flash = []
background_layer = None
trail_layer = None
paused = False
show_annotations = False
last_time = None
simulation_time = 0.0
detected_events = 0
pending_secondaries = []


def depth_y(meters):
    return SURFACE + meters / ICE_DEPTH_METERS * (ICE_BOTTOM - SURFACE)


def rotate(particle, angle):
    c, s = math.cos(angle), math.sin(angle)
    vx, vy = particle.vx, particle.vy
    particle.vx = c * vx - s * vy
    particle.vy = s * vx + c * vy


class Particle:
    __slots__ = ("kind", "x", "y", "vx", "vy", "active", "air_budget",
                 "ice_budget", "scatter_budget", "interaction_y", "source")

    def __init__(self, kind, x, y, angle=0.0, source=None):
        self.kind, self.x, self.y = kind, x, y
        self.vx = math.sin(angle) * TRANSPORT_SPEED
        self.vy = math.cos(angle) * TRANSPORT_SPEED
        self.active = True
        self.source = source
        # Budgets are distances traveled, not frame-based probabilities.
        self.air_budget = random.expovariate(1 / 38) if kind == "proton" else math.inf
        mean_path = {"proton": 22, "photon": 30, "muon": 800}.get(kind)
        self.ice_budget = random.expovariate(1 / mean_path) if mean_path else math.inf
        self.scatter_budget = random.expovariate(1 / 12)
        self.interaction_y = math.inf
        if kind == "neutrino" and random.random() < NEUTRINO_INTERACTION_FRACTION:
            self.interaction_y = random.uniform(depth_y(1450), depth_y(2400))

    def update(self, dt):
        if not self.active:
            return
        distance = TRANSPORT_SPEED * dt
        # Primary cosmic protons usually shower in the atmosphere. A small
        # subset of those showers supplies penetrating secondary muons.
        if self.kind == "proton" and 150 <= self.y < SURFACE:
            if self.air_budget <= distance:
                distance = self.air_budget
                self.active = False
                if random.random() < 0.035:
                    pending_secondaries.append((self, "atmosphere"))
            else:
                self.air_budget -= distance

        if self.y >= SURFACE:
            if self.ice_budget <= distance:
                distance = self.ice_budget
                self.active = False
            else:
                self.ice_budget -= distance
            if self.kind == "photon" and self.active:
                self.scatter_budget -= distance
                if self.scatter_budget <= 0:
                    rotate(self, random.gauss(0, 0.45))
                    self.scatter_budget = random.expovariate(1 / 12)

        # Freeze a neutrino track at its rare interaction point and create
        # a charged secondary. Neutrinos themselves do not emit Cherenkov light.
        if self.kind == "neutrino" and self.y < self.interaction_y:
            vertical_step = self.vy / TRANSPORT_SPEED * distance
            if self.y + vertical_step >= self.interaction_y:
                distance = (self.interaction_y - self.y) * TRANSPORT_SPEED / self.vy
                self.active = False
                pending_secondaries.append((self, "neutrino"))

        self.x += self.vx / TRANSPORT_SPEED * distance
        self.y += self.vy / TRANSPORT_SPEED * distance
        if self.x < -20 or self.x > WIDTH + 20 or self.y < -20 or self.y > ICE_BOTTOM:
            self.active = False


class LightEvent:
    """Illustrative outward light pulse from a charged-secondary track."""
    def __init__(self, x, y, direction, source):
        self.x, self.y = x, y
        self.dx, self.dy = direction
        self.source = source
        self.age = 0.0
        self.registered = False
        self.hit_sensors = set()

    def update(self, dt):
        global detected_events
        self.age += dt
        radius = self.age * 6
        for index, (x, y) in enumerate(sensors):
            if index in self.hit_sensors:
                continue
            distance = math.hypot(x - self.x, y - self.y)
            if distance <= min(radius, 165):
                self.hit_sensors.add(index)
                sensor_flash[index] = 1.0
        if not self.registered and len(self.hit_sensors) >= 3:
            self.registered = True
            detected_events += 1

    def draw(self):
        alpha = max(0, 1 - self.age / 32)
        py5.stroke(36, 148, 214, alpha * 145)
        py5.stroke_weight(1)
        # Schematic Cherenkov cone edges around the charged secondary.
        length = min(self.age * 6, 165)
        for angle in (-0.65, 0.65):
            c, s = math.cos(angle), math.sin(angle)
            dx = self.dx * c - self.dy * s
            dy = self.dx * s + self.dy * c
            py5.line(self.x, self.y, self.x + dx * length, self.y + dy * length)


def build_background():
    global background_layer
    if background_layer is None:
        background_layer = py5.create_graphics(WIDTH, HEIGHT)
    g = background_layer
    g.begin_draw()
    g.background(255)
    g.no_stroke()
    g.fill(247, 250, 253)
    g.rect(0, 100, WIDTH, SURFACE - 100)
    g.fill(238, 246, 250)
    g.rect(0, SURFACE, WIDTH, ICE_BOTTOM - SURFACE)
    g.fill(226, 232, 236)
    g.rect(0, ICE_BOTTOM, WIDTH, HEIGHT - ICE_BOTTOM)
    g.stroke(150, 177, 193, 160)
    g.stroke_weight(1)
    g.line(0, SURFACE, WIDTH, SURFACE)
    # Representative detector strings, not all 86 actual strings/5,160 DOMs.
    top, bottom = depth_y(1450), depth_y(2450)
    for index in range(10):
        x = 320 + index * 62
        g.stroke(143, 168, 184, 80)
        g.line(x, SURFACE, x, bottom)
        for row in range(12):
            y = top + row / 11 * (bottom - top)
            sensors.append((x, y))
            g.no_fill()
            g.stroke(114, 143, 163, 140)
            g.circle(x, y, 4)
    g.end_draw()


def reset():
    global last_time, simulation_time, detected_events
    primaries.clear()
    secondaries.clear()
    pending_secondaries.clear()
    events.clear()
    sensor_flash[:] = [0.0] * len(sensors)
    simulation_time = 0.0
    detected_events = 0
    # One simultaneous wave of 900 primaries, covering the whole surface.
    for group, kind in enumerate(("proton", "photon", "neutrino")):
        for index in range(PARTICLES_PER_TYPE):
            x = 30 + (index + group / 3) / PARTICLES_PER_TYPE * (WIDTH - 60)
            primaries.append(Particle(kind, x, random.uniform(45, 85),
                                      random.uniform(-0.13, 0.13)))
    trail_layer.begin_draw()
    trail_layer.clear()
    trail_layer.end_draw()
    last_time = time.perf_counter()


def advance(dt):
    global simulation_time
    simulation_time += dt
    trail_layer.begin_draw()
    trail_layer.stroke_weight(0.8)
    current_kind = None
    for collection in (primaries, secondaries):
        for particle in collection:
            if not particle.active:
                continue
            x, y = particle.x, particle.y
            particle.update(dt)
            if particle.kind != current_kind:
                trail_layer.stroke(*COLORS[particle.kind], 140)
                current_kind = particle.kind
            trail_layer.line(x, y, particle.x, particle.y)
    trail_layer.end_draw()

    for parent, source in pending_secondaries:
        # These are physical secondaries of the original wave, not replacement
        # primary particles or continuous emission from space.
        angle = math.atan2(parent.vx, parent.vy) + random.uniform(-0.04, 0.04)
        muon = Particle("muon", parent.x, parent.y, angle, source)
        secondaries.append(muon)
        if source == "neutrino":
            events.append(LightEvent(muon.x, muon.y,
                                    (muon.vx / TRANSPORT_SPEED,
                                     muon.vy / TRANSPORT_SPEED), source))
    pending_secondaries.clear()

    # Muons from atmospheric showers can also produce light deep in the ice.
    for muon in secondaries:
        if (muon.active and muon.source == "atmosphere"
                and depth_y(1450) <= muon.y <= depth_y(2450)):
            events.append(LightEvent(muon.x, muon.y,
                                    (muon.vx / TRANSPORT_SPEED,
                                     muon.vy / TRANSPORT_SPEED), "atmosphere"))
            muon.source = "recorded"
    for event in events:
        event.update(dt)
    events[:] = [event for event in events if event.age < 32]
    for index in range(len(sensor_flash)):
        sensor_flash[index] = max(0, sensor_flash[index] - dt / 22)


def annotations():
    py5.no_stroke()
    py5.fill(255, 255, 255, 245)
    py5.rect(14, 8, WIDTH - 28, 31)
    py5.text_size(12)
    for index, kind in enumerate(COLORS):
        py5.fill(*COLORS[kind])
        py5.text(kind.upper(), 28 + index * 120, 28)
    py5.fill(82, 102, 119)
    py5.text("SPACE pause   R new wave   H labels", 890, 28)
    py5.text("Atmosphere / cosmic-ray showers", 20, 145)
    py5.text("South Pole snow and ice", 20, SURFACE + 24)
    py5.text("1,450 m", 234, depth_y(1450) + 4)
    py5.text("2,450 m", 234, depth_y(2450) + 4)
    py5.text("IceCube optical sensors", 340, depth_y(1450) - 14)
    py5.text("Illustrative scales / rare interactions amplified", 20, HEIGHT - 20)
    py5.text(f"Light events registered: {detected_events}", 890, HEIGHT - 20)


def setup():
    global trail_layer
    py5.size(WIDTH, HEIGHT)
    py5.smooth()
    py5.frame_rate(60)
    py5.window_title("South Pole / IceCube")
    trail_layer = py5.create_graphics(WIDTH, HEIGHT)
    build_background()
    reset()


def draw():
    global last_time
    now = time.perf_counter()
    remaining = min(now - last_time, 0.1) * 60 * SIMULATION_SPEED
    last_time = now
    if not paused:
        while remaining > 1e-9:
            dt = min(remaining, 0.25)
            advance(dt)
            remaining -= dt
    py5.image(background_layer, 0, 0)
    py5.image(trail_layer, 0, 0)
    for event in events:
        event.draw()
    py5.no_stroke()
    for (x, y), intensity in zip(sensors, sensor_flash):
        if intensity > 0:
            py5.fill(36, 148, 214, intensity * 180)
            py5.circle(x, y, 7)
    if show_annotations:
        annotations()


def key_pressed():
    global paused, show_annotations, last_time
    key = str(py5.key).lower()
    if key == " ":
        paused = not paused
        last_time = time.perf_counter()
    elif key == "r":
        reset()
    elif key == "h":
        show_annotations = not show_annotations


if __name__ == "__main__":
    py5.run_sketch()
