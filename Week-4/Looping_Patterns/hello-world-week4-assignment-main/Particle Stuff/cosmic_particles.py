"""Abstract cosmic particle transport. Run: python cosmic_particles.py.

All visuals are generated in code; no asset paths are required. Forces and
lengths are illustrative visual units, not a quantitative astrophysics model.
"""

# HOW TO READ THIS SKETCH
# Python first executes the imports, creates the settings and shared variables,
# and defines the functions and Particle class below. Defining a function saves
# its instructions for later; it does not immediately run those instructions.
# At the bottom, run_sketch() starts py5, which calls setup() once and draw()
# repeatedly. Keyboard input causes py5 to call key_pressed().
#
# The picture combines two drawing surfaces: a white environment with symbols,
# and a transparent layer that keeps all the particle trails drawn so far.
# Each moving particle stores its current position and velocity. Every frame
# advances those values a little and draws a line from the old position to the
# new one. Nothing here attempts to use real astronomical distances or units.
#
# A # starts a comment. Indentation groups statements into functions, loops,
# classes, and if/else branches. A colon introduces an indented block.
# A single = assigns a value; == compares values; ** raises a number to a power.
# Names in CAPITALS are settings by convention, although some are reassigned
# when a new burst is created. Python does not enforce constant values for them.
#
# math supplies trigonometry, square roots, and mathematical constants.
import math
# random supplies different positions, styles, and collision outcomes each run.
import random
# time supplies a precise clock so movement can follow elapsed real time.
import time

# py5 is the graphics library: it opens the window, runs the animation loop,
# draws shapes, and delivers keyboard events. It is an external dependency;
# math, random, and time above are included with Python itself.
import py5


# Assign two values at once: a canvas 1,200 pixels wide and 800 pixels tall.
# In the drawing coordinates, (0, 0) is the top-left corner. Increasing x moves
# right; increasing y moves down. Positions may contain fractional pixel values.
WIDTH, HEIGHT = 1200, 800
# There are three species, each with this many Particle objects in one burst.
PARTICLES_PER_TYPE = 400  # 1,200 particles in one simultaneous burst
# This multiplier scales elapsed time before applying particle movement.
# A smaller positive value makes the same paths unfold more slowly.
SIMULATION_SPEED = 0.075  # Run at 7.5% of the unscaled simulation pace.
# Motion settings use illustrative simulation units, not physical units.
# Gravity strength scales the attraction; softening limits it near the center.
GRAVITY_STRENGTH = 2300
GRAVITY_SOFTENING = 0.6
# Protons turn by this many radians per step at the magnetic field's center.
MAGNET_TURN_RATE = 0.055
# Dust drag reduces proton speed. Event rates are probabilities per full step
# at the dust center; density and the current time interval adjust them later.
PROTON_DUST_DRAG = 0.012
PROTON_SCATTER_RATE = 0.04
PHOTON_ABSORPTION_RATE = 0.006
PHOTON_SCATTER_RATE = 0.028
# Standard deviations in radians: larger values allow wider random turns.
PROTON_SCATTER_SPREAD = 0.22
PHOTON_SCATTER_SPREAD = 0.45
MAX_PROTON_SPEED = 6.0
# Retire particles only after they pass this far beyond the canvas, in pixels.
OFFSCREEN_MARGIN = 35
# Placement gaps are also pixels, but control different parts of the scene.
ORIGIN_CLEARANCE = 35
ELEMENT_CLEARANCE = 45
ELEMENT_EDGE_MARGIN = 45
# Limit random searches so even a crowded arrangement eventually returns.
ORIGIN_PLACEMENT_ATTEMPTS = 1000
ELEMENT_PLACEMENT_ATTEMPTS = 500
# Timing settings: requested frames per second, maximum real seconds counted
# per frame, and maximum simulation steps applied in one movement update.
TARGET_FRAME_RATE = 60
MAX_FRAME_INTERVAL = 0.1
MAX_SIMULATION_STEP = 0.25
# A dictionary maps each species name (a string key) to its drawing color.
# Each color is an (R, G, B) tuple: red, green, and blue values from 0 to 255.
# Dictionary insertion order determines the order in which species are created
# and drawn. Each species has its own list in particles_by_kind below.
COLORS = {
    # Warm brown for protons.
    "proton": (196, 112, 49),
    # Blue-green for photons.
    "photon": (32, 145, 158),
    # Purple for neutrinos.
    "neutrino": (134, 102, 191),
}
# Speeds are pixels per simulation step, not real physical speeds. draw()
# calculates how much of a step to apply using the variable named dt.
SPEEDS = {"proton": 2.5, "photon": 4.3, "neutrino": 4.2}

# Three abstract elements: gravity (empty ring), dust (hatching), magnetism (X).
# Randomized positions, radii, strength, and symbol styles for each burst.
# Each tuple groups values describing one element. A circle needs its center's
# x and y coordinates and its radius. Gravity also has a mass-like strength.
# These initial values are replaced by randomize_elements() during startup.
GRAVITY = (350, 280, 100, 1.8)
# Dust and magnet tuples each contain (center_x, center_y, radius).
DUST = (640, 450, 95)
MAGNET = (940, 270, 110)
# A randomly selected burst origin stays this far from each canvas edge.
ORIGIN_MARGIN = 160
# / performs division. This initial center point is replaced during each reset.
ORIGIN = (WIDTH / 2, HEIGHT / 2)  # Randomized at startup and on R.

# Shared state is kept at module level so the callbacks can use the same data.
# {} creates an empty dictionary. reset_particles() adds one list per species:
# particles_by_kind["proton"], for example, holds just the proton objects.
# Keeping separate lists removes the need to calculate species' list indices.
particles_by_kind = {}
# None means "no value yet." setup()/reset_particles() create the graphics
# surfaces before the first draw() callback needs them.
environment = None
trail_layer = None
# {} creates an empty dictionary; randomize_elements() fills in style choices.
element_styles = {}
# A Boolean has one of two values: True or False. Space toggles this flag.
paused = False
# The previous clock reading will be saved here to measure time between frames.
last_time = None


# A function definition names reusable instructions and their inputs.
# Here, particle is an object to modify and angle is a rotation in radians.
# A full turn is math.tau radians (2 * pi), rather than 360 degrees.
def rotate_velocity(particle, angle):
    # Calculate these once because both new velocity components need them.
    c, s = math.cos(angle), math.sin(angle)
    # Keep copies of BOTH old components before changing either component.
    # Otherwise the second calculation could accidentally use the new vx.
    vx, vy = particle.vx, particle.vy
    # These are the standard two-dimensional rotation formulas. Together they
    # turn the velocity vector while preserving its length (the speed), apart
    # from rounding. Positive angles look clockwise because screen y goes down.
    particle.vx = c * vx - s * vy
    particle.vy = s * vx + c * vy


def chance(rate, dt):
    """Convert a per-step collision chance to the current time step."""
    # rate is an event's probability for one full simulation step, and dt is
    # the number of simulation steps being applied now (often a fraction).
    # (1 - rate) is the probability of NO event for a full step. Raising that
    # to dt adjusts the survival probability to this duration; subtracting
    # from 1 converts it back to the probability of an event.
    # random.random() gives a value from 0 up to, but not including, 1. Comparing
    # it with the threshold returns True for an event or False for no event.
    return random.random() < 1 - (1 - rate) ** dt


# A class is a blueprint for objects. Each Particle instance has its own
# position, velocity, species, and active flag, plus the methods defined here.
class Particle:
    # __slots__ lists the instance attributes this class supports. It avoids
    # allocating a separate attribute dictionary for every particle, which
    # helps when creating 1,200 objects. The final comma is legal tuple syntax.
    __slots__ = ("kind", "angle", "x", "y", "vx", "vy", "active",
                 )

    # Python calls __init__ when Particle(kind, angle) creates an instance.
    # self refers to that particular object. self.x, for example, belongs to
    # this particle, while another particle can have a different x value.
    def __init__(self, kind, angle):
        # Remember which species this is and the direction it started in.
        # angle stays as the initial angle; later turns modify vx/vy directly.
        self.kind = kind
        self.angle = angle
        # Unpack the shared origin tuple into the particle's own coordinates.
        self.x, self.y = ORIGIN
        # Look up the starting speed using this particle's species as the key.
        speed = SPEEDS[self.kind]
        # Convert a direction and speed into horizontal and vertical movement.
        # cos gives the horizontal share, and sin gives the vertical share.
        # A negative component moves left (vx) or upward (vy).
        self.vx = speed * math.cos(self.angle)
        self.vy = speed * math.sin(self.angle)
        # Active particles move. Absorption or leaving the viewing area will
        # set this to False; the object and its old trail are retained.
        self.active = True

    # Apply one small interval of motion, measured in simulation steps.
    def update(self, dt):
        # "not" reverses a Boolean. return exits this method immediately,
        # avoiding all further calculations for an inactive particle.
        if not self.active:
            return
        # Read this method as the particle's checklist for one small interval.
        # Each helper changes this same object's velocity or active flag.
        # Keep the interactions in this order: gravity, magnetism, then dust.
        self.apply_gravity(dt)
        self.apply_magnetism(dt)
        self.apply_dust(dt)

        # Dust may have absorbed a photon. Returning from apply_dust() only
        # ends that helper, so update() must also stop before moving it.
        if not self.active:
            return

        self.adjust_speed()
        # Position changes by velocity times the interval being simulated.
        # Use the velocity after all force and speed adjustments.
        self.x += self.vx * dt
        self.y += self.vy * dt

        # "or" accepts any one of these boundary conditions. Parentheses
        # let this single condition continue across several physical lines.
        if (self.x < -OFFSCREEN_MARGIN
                or self.x > WIDTH + OFFSCREEN_MARGIN
                or self.y < -OFFSCREEN_MARGIN
                or self.y > HEIGHT + OFFSCREEN_MARGIN):
            # Leave the object in its species list, but stop updating it.
            # Its trail remains visible and no replacement particle is created.
            self.active = False

    # Change velocity toward the gravity center, for every species.
    def apply_gravity(self, dt):
        # Tuple unpacking gives readable local names to the gravity settings.
        gx, gy, radius, mass = GRAVITY
        # This vector points from the particle toward the gravity center.
        dx, dy = gx - self.x, gy - self.y
        # Softened gravity also qualitatively bends the neutral particles.
        # dx*dx + dy*dy is squared distance. Adding a positive softening term
        # prevents division by zero and limits the force near the center.
        # ** 1.5 raises the entire sum to the 3/2 power. Multiplying the result
        # below by dx or dy supplies the direction and component size.
        # The named strength and softening settings control the visual effect.
        force = GRAVITY_STRENGTH * mass / (
            dx * dx + dy * dy + (radius * GRAVITY_SOFTENING)**2
        ) ** 1.5
        # += adds to the existing value. Acceleration changes velocity first;
        # multiplying by dt makes the change proportional to the time interval.
        self.vx += dx * force * dt
        self.vy += dy * force * dt

    # Turn protons that are inside the magnetic circle.
    def apply_magnetism(self, dt):
        mx, my, field_radius = MAGNET
        # Comparing squared distances avoids computing a square root here.
        distance_squared = (self.x - mx)**2 + (self.y - my)**2
        # "and" requires both conditions to be true before entering this block.
        if self.kind == "proton" and distance_squared < field_radius**2:
            # Strength is 1 at the center and fades toward 0 at the boundary.
            # Squaring the fraction shapes how smoothly the effect fades.
            strength = (1 - distance_squared / field_radius**2) ** 2
            # Turn the current velocity by a small angle without changing its
            # speed in this operation. Larger dt means a larger turn.
            rotate_velocity(self, MAGNET_TURN_RATE * strength * dt)

    # Slow or scatter protons; scatter or absorb photons. Neutrinos are ignored.
    def apply_dust(self, dt):
        # Dust density is 1 at its center, 0 at its edge, and negative outside.
        # Only a positive density leads to dust interactions below.
        cx, cy, dust_radius = DUST
        density = 1 - ((self.x - cx)**2 + (self.y - cy)**2) / dust_radius**2
        if density > 0:
            # Protons lose some speed in dust and may also scatter sideways.
            if self.kind == "proton":
                # For positive dt, this multiplier is below 1. Raising it to dt
                # adjusts the amount of drag to the current interval length.
                drag = (1 - PROTON_DUST_DRAG * density) ** dt
                # *= multiplies the current value by the value on the right.
                # Scaling both components equally slows motion without turning.
                self.vx *= drag
                self.vy *= drag
                # Denser dust makes a random scattering event more likely.
                if chance(PROTON_SCATTER_RATE * density, dt):
                    # gauss(mean, standard_deviation) samples a bell-shaped
                    # distribution: most turns are small, with rarer large
                    # ones. A mean of 0 allows turns in either direction.
                    rotate_velocity(self, random.gauss(0, PROTON_SCATTER_SPREAD))
            # elif means "otherwise, if"; a proton does not enter this branch.
            elif self.kind == "photon":
                # First give this photon a chance to be absorbed by the dust.
                if chance(PHOTON_ABSORPTION_RATE * density, dt):
                    # Stop motion on absorption; its drawn path stays on the canvas.
                    self.active = False
                    # Skip scattering. update() checks the flag after this
                    # helper returns and also skips the photon's movement.
                    return
                # A surviving photon can scatter, with a wider angular spread
                # than proton scattering, as set by the two spread constants.
                if chance(PHOTON_SCATTER_RATE * density, dt):
                    rotate_velocity(self, random.gauss(0, PHOTON_SCATTER_SPREAD))
            # Neutrinos pass through dust and the magnetic field.

    # Limit proton speed, or restore a photon/neutrino to its configured speed.
    def adjust_speed(self):
        # hypot computes sqrt(vx**2 + vy**2), the velocity vector's length.
        speed = math.hypot(self.vx, self.vy)
        # Choose a target speed by species. Protons keep their changed speed
        # up to MAX_PROTON_SPEED. Photons and neutrinos are rescaled to their
        # species' configured constant speed.
        if self.kind == "proton":
            target = min(speed, MAX_PROTON_SPEED)
        else:
            target = SPEEDS[self.kind]
        # 1e-12 means 0.000000000001. Avoid dividing by zero or an almost-zero
        # number. Multiplying both components by target/speed preserves direction.
        if speed > 1e-12:
            self.vx *= target / speed
            self.vy *= target / speed


def choose_origin():
    # This function returns an (x, y) pair for the next burst's starting point.
    # Leave room for an expanding burst and avoid starting inside an element.
    # Limit the attempts so a difficult arrangement cannot keep this search
    # running forever. _ means the loop's counter is
    # deliberately unused; only the repeated attempts matter here.
    for _ in range(ORIGIN_PLACEMENT_ATTEMPTS):
        # uniform(a, b) samples a floating-point number between the bounds.
        # These bounds leave ORIGIN_MARGIN pixels around the canvas perimeter.
        x = random.uniform(ORIGIN_MARGIN, WIDTH - ORIGIN_MARGIN)
        y = random.uniform(ORIGIN_MARGIN, HEIGHT - ORIGIN_MARGIN)
        # Start by assuming this candidate is safe, then check each element.
        # GRAVITY[:3] takes its first three values, leaving out its mass so all
        # three circle descriptions have the same (cx, cy, radius) structure.
        clear_of_elements = True
        for cx, cy, radius in (GRAVITY[:3], DUST, MAGNET):
            distance = math.hypot(x - cx, y - cy)
            minimum_distance = radius + ORIGIN_CLEARANCE
            if distance <= minimum_distance:
                clear_of_elements = False
                # One failed check is enough to reject this candidate.
                # break exits this inner loop; the next attempt picks a new x/y.
                break
        if clear_of_elements:
            # Return the first acceptable point; no later attempts are needed.
            return x, y
    # If every attempt failed, use a predictable point near the bottom center.
    # This fallback guarantees a result, but does not repeat the clearance test.
    return WIDTH / 2, HEIGHT - ORIGIN_MARGIN


def reset_particles():
    # Assignments to these names should replace the module-level values.
    # Without global, an assignment inside this function would create a local.
    # particles_by_kind and trail_layer need no global declaration here:
    # we modify their objects without assigning new objects to those names.
    global ORIGIN, last_time
    # Choose the new physical elements and their appearance before choosing an
    # origin; the origin search needs the updated positions and radii.
    randomize_elements()
    # Rebuild the background image to match the new element settings.
    build_environment()
    ORIGIN = choose_origin()
    # Off-screen graphics are edited between begin_draw() and end_draw().
    # clear() removes old trails and restores this layer's transparency.
    trail_layer.begin_draw()
    trail_layer.clear()
    trail_layer.end_draw()
    # The only particle creation happens here: startup or an explicit R.
    # clear() empties the dictionary; its old lists and objects are discarded
    # when nothing else refers to them. This reset does not change paused.
    particles_by_kind.clear()
    # Rotate the entire burst by a random angle to vary the starting pattern.
    rotation = random.uniform(0, math.tau)
    # One full turn divided by 400 gives equal angular gaps for each species.
    spacing = math.tau / PARTICLES_PER_TYPE
    # Iterating over a dictionary yields its keys in insertion order.
    # enumerate supplies both a zero-based counter and the current species name.
    for kind_index, kind in enumerate(COLORS):
        # Each species covers exactly 360 degrees with equal angular spacing.
        # Interleave the colors so the initial lines do not all overlap.
        # len(COLORS) is 3. Species begin 0, 1/3, and 2/3 of one spacing apart.
        offset = rotation + kind_index * spacing / len(COLORS)
        # Make a separate list for this species. [] creates an empty list;
        # assigning it under kind lets draw() find the group by its name.
        species_particles = []
        particles_by_kind[kind] = species_particles
        # Each loop iteration calculates one angle, constructs one Particle,
        # and appends it. With the current settings, index runs from 0 to 399.
        for index in range(PARTICLES_PER_TYPE):
            angle = offset + index * spacing
            particle = Particle(kind, angle)
            species_particles.append(particle)
    # Start timing from the end of the reset so rebuilding the scene does not
    # count as time that the new particles should already have been moving.
    last_time = time.perf_counter()


def randomize_elements():
    # These assignments replace the shared element tuples and style dictionary.
    global GRAVITY, DUST, MAGNET, element_styles
    # Accumulate circle descriptions that have already been placed.
    circles = []
    # Backup center positions, one for each of the three elements.
    defaults = [(350, 280), (640, 450), (940, 270)]
    # range(3) gives 0, 1, 2: one iteration each for gravity, dust, and magnetism.
    for index in range(3):
        # Each element gets its own randomly chosen radius, measured in pixels.
        radius = random.uniform(65, 110)
        # Remember whether any candidate succeeds. If every attempt fails,
        # the flag stays False and the backup center is used below.
        position_found = False
        for _ in range(ELEMENT_PLACEMENT_ATTEMPTS):
            # Keep the entire circle inside the canvas with an edge margin.
            x = random.uniform(radius + ELEMENT_EDGE_MARGIN,
                               WIDTH - radius - ELEMENT_EDGE_MARGIN)
            y = random.uniform(radius + ELEMENT_EDGE_MARGIN,
                               HEIGHT - radius - ELEMENT_EDGE_MARGIN)
            # Compare against each circle already placed. Its radius is named
            # other to distinguish it from the new circle's radius.
            # Centers must be farther apart than both radii plus the clearance.
            clear_of_circles = True
            for cx, cy, other in circles:
                distance = math.hypot(x - cx, y - cy)
                minimum_distance = radius + other + ELEMENT_CLEARANCE
                if distance <= minimum_distance:
                    clear_of_circles = False
                    break
            # With no previous circles, the check loop does nothing and the
            # flag stays True: the first element can accept its first candidate.
            if clear_of_circles:
                position_found = True
                # Stop trying centers for this element once one succeeds.
                break
        if not position_found:
            # Use the element's backup center if no acceptable random one was
            # found. This fallback is not guaranteed to satisfy the gap check.
            x, y = defaults[index]
        # append() adds one tuple to the end of the list of placed circles.
        circles.append((x, y, radius))
    # Gravity needs a fourth value for its strength. Unpack the first circle,
    # choose that strength, and build the four-value tuple explicitly.
    gx, gy, gravity_radius = circles[0]
    mass = random.uniform(1.1, 2.4)
    GRAVITY = (gx, gy, gravity_radius, mass)
    # List indices start at 0, so the other circles are entries 1 and 2.
    DUST = circles[1]
    MAGNET = circles[2]
    # Keep the randomly chosen drawing styles for the new environment image.
    # randint includes both integer endpoints; choice selects one listed value.
    element_styles = {
        # Total count of concentric rings in the gravity symbol.
        "rings": random.randint(1, 3),
        # Pixel distance between parallel dust hatch lines.
        "hatch_spacing": random.randint(14, 24),
        # Rotate the dust's hatch pattern by this many radians.
        "hatch_angle": random.uniform(0, math.tau),
        # True adds a second crossing family of hatch lines; False uses one.
        "crosshatch": random.choice((True, False)),
        # Rotate the magnet's X symbols around its center.
        "magnet_angle": random.uniform(0, math.tau),
        # Draw either one centered X or three X symbols in a row.
        "magnet_symbols": random.choice((1, 3)),
        # Stroke weight is the line thickness, measured in pixels.
        "weight": random.uniform(0.8, 1.5),
    }


def build_environment():
    """Cache the randomized white canvas and three unshaded symbols."""
    # The environment is redrawn at reset, then reused unchanged every frame.
    # This avoids recalculating all the background symbols during animation.
    global environment
    # Allocate the drawing surface once. Later resets reuse the same object.
    # "is None" checks whether the initial placeholder is still present.
    if environment is None:
        environment = py5.create_graphics(WIDTH, HEIGHT)
    # Begin editing this off-screen surface rather than the main window.
    environment.begin_draw()
    # One grayscale value of 255 paints the entire surface white.
    environment.background(255)
    # Draw shape outlines without filling their interiors.
    environment.no_fill()
    # The chosen thickness applies to subsequent lines and circle outlines.
    environment.stroke_weight(element_styles["weight"])
    # Pass the SAME drawing surface to each helper, in back-to-front order.
    # The helpers add their marks without opening a separate drawing session.
    draw_gravity_symbol(environment)
    draw_dust_symbol(environment)
    draw_magnet_symbol(environment)
    environment.end_draw()


# graphics is a parameter: it refers to the surface supplied by the caller.
# Using a parameter makes the helpers' drawing destination explicit.
def draw_gravity_symbol(graphics):
    # The fourth tuple value is unused for drawing;
    # assigning it to _ communicates that we only need the center and radius.
    gx, gy, radius, _ = GRAVITY
    # Four stroke arguments mean red, green, blue, and alpha (opacity).
    # An alpha below 255 lets the white background show through the stroke.
    graphics.stroke(135, 145, 165, 145)
    # circle() expects a diameter, so multiply the stored radius by 2.
    graphics.circle(gx, gy, radius * 2)
    # range starts at 1 and stops BEFORE the ring count. The outer ring was
    # already drawn, so this draws zero, one, or two smaller rings inside it.
    for index in range(1, element_styles["rings"]):
        # Each successive inner ring has a diameter 18% of the outer diameter
        # smaller than the previous one: factors 0.82, then 0.64.
        graphics.circle(gx, gy, radius * 2 * (1 - index * 0.18))


def draw_dust_symbol(graphics):
    # Now draw the dust outline and its interior hatch pattern.
    cx, cy, radius = DUST
    graphics.stroke(151, 132, 161, 125)
    graphics.circle(cx, cy, radius * 2)
    # Save the current coordinate transformation before moving or rotating it.
    # pop_matrix() below restores it so these changes do not affect the magnet.
    graphics.push_matrix()
    # Put local (0, 0) at the dust center, then rotate the local drawing axes.
    # The hatch coordinates below are measured in this temporary coordinate
    # system; the already-drawn circle is not moved or redrawn by these calls.
    graphics.translate(cx, cy)
    graphics.rotate(element_styles["hatch_angle"])
    # sqrt(2) normalizes diagonal direction vectors to a length of 1.
    root_two = math.sqrt(2)
    # Leave a small gap between the hatch endpoints and the dust outline.
    inner_radius = radius - 8
    spacing = element_styles["hatch_spacing"]
    # // is floor division. Convert to int for use in range(): this is how
    # many parallel lines fit on each side of the center at this spacing.
    extent = int(inner_radius // spacing)
    # Two slopes create crossing diagonal families. (1,) is a one-item tuple;
    # its comma is needed to distinguish it from a parenthesized number.
    if element_styles["crosshatch"]:
        slopes = (-1, 1)
    else:
        slopes = (1,)
    # Include negative offsets, the center line (0), and positive offsets.
    # extent + 1 includes the last positive index because range excludes its stop.
    for index in range(-extent, extent + 1):
        # Signed perpendicular distance from the circle center to this line.
        offset = index * spacing
        # A chord is a line segment joining two points on a circle. By the
        # Pythagorean theorem, half its length is sqrt(r**2 - offset**2).
        # max(0, ...) guards the square root against a negative input.
        half_chord = math.sqrt(max(0, inner_radius**2 - offset**2))
        # Draw this offset once for each selected diagonal direction.
        for slope in slopes:
            # n is a unit vector perpendicular to the line; u is a unit vector
            # pointing along it. Their components change with the slope sign.
            nx, ny = -slope / root_two, 1 / root_two
            ux, uy = 1 / root_two, slope / root_two
            # Move along n to find this chord's midpoint inside the circle.
            x, y = offset * nx, offset * ny
            # From the midpoint, go half a chord in each direction along u.
            # line(x1, y1, x2, y2) connects those two endpoints.
            graphics.line(x - half_chord * ux, y - half_chord * uy,
                          x + half_chord * ux, y + half_chord * uy)
    # Restore the coordinates saved before the dust translation and rotation.
    graphics.pop_matrix()


def draw_magnet_symbol(graphics):
    # Draw the magnetic field boundary in another muted color.
    mx, my, radius = MAGNET
    graphics.stroke(106, 153, 150, 145)
    graphics.circle(mx, my, radius * 2)
    # Give the X symbols their own temporary centered, rotated coordinates.
    graphics.push_matrix()
    graphics.translate(mx, my)
    graphics.rotate(element_styles["magnet_angle"])
    # One symbol uses offset 0. Three use positions 30 pixels apart along
    # the local horizontal axis, before the whole arrangement is rotated.
    if element_styles["magnet_symbols"] == 1:
        offsets = (0,)
    else:
        offsets = (-30, 0, 30)
    for offset in offsets:
        # Two diagonals, each spanning an 18-by-18 square, make one X.
        graphics.line(offset - 9, -9, offset + 9, 9)
        graphics.line(offset - 9, 9, offset + 9, -9)
    # Balance push_matrix(). build_environment() ends the drawing session
    # after all three symbol helpers have returned.
    graphics.pop_matrix()


# py5 recognizes this callback name and calls it once when the sketch starts.
def setup():
    # Save the new graphics object where draw() and reset_particles() can use it.
    global trail_layer
    # Configure the main drawing window using the dimensions defined above.
    py5.size(WIDTH, HEIGHT)
    # Request smoothing (anti-aliasing) for drawing, reducing jagged edges.
    py5.smooth()
    # Request TARGET_FRAME_RATE draw() calls per second. Actual performance
    # may vary, so movement uses measured elapsed time rather than frame counts.
    py5.frame_rate(TARGET_FRAME_RATE)
    # This text appears in the window's title bar.
    py5.window_title("Cosmic passage")
    # A separate full-size surface holds trails independently of the background.
    # It must exist before reset_particles() tries to clear it.
    trail_layer = py5.create_graphics(WIDTH, HEIGHT)
    # Build the first scene, create the particles, and initialize the clock.
    reset_particles()


# py5 repeatedly calls draw() while the sketch runs, even when our paused
# flag is True. That lets the window keep displaying the existing image.
def draw():
    global last_time
    # perf_counter() gives a precise clock reading in seconds. Its difference
    # from an earlier reading matters; it is not a calendar date or time.
    now = time.perf_counter()
    # Clamp the frame interval to 0 through MAX_FRAME_INTERVAL seconds.
    # The lower bound prevents negative movement; the upper bound limits jumps if
    # rendering stalls. Time beyond that cap is discarded, not caught up later.
    elapsed = min(max(now - last_time, 0), MAX_FRAME_INTERVAL)
    # Update this even when paused so paused time does not build up as motion.
    last_time = now
    # Only advance the simulation and add trail segments when it is unpaused.
    if not paused:
        # Convert real seconds to simulation steps. At the target frame rate,
        # each frame would be one step before applying the speed
        # multiplier. remaining is the simulation time left to process now.
        remaining = elapsed * TARGET_FRAME_RATE * SIMULATION_SPEED
        # Begin adding marks to the off-screen trail surface. No background()
        # or clear() call is made here, so its previous pixels remain intact.
        trail_layer.begin_draw()
        trail_layer.no_fill()
        # Particle paths use one-pixel-wide strokes.
        trail_layer.stroke_weight(1)
        # Draw only each new segment into a persistent transparent layer.
        # Never clear it during a burst: every full path remains visible,
        # including paths of absorbed or off-canvas particles. This avoids
        # redrawing thousands of increasingly long paths every frame.
        # A while loop repeats as long as its condition is True. 1e-9 is a
        # tiny tolerance (0.000000001) that ignores negligible time leftovers.
        while remaining > 1e-9:
            # Split the frame's interval into pieces up to MAX_SIMULATION_STEP.
            # Small updates reduce abrupt turns and large jumps through force
            # regions; they do not make this exact physics.
            dt = min(remaining, MAX_SIMULATION_STEP)
            # items() yields each species name together with its RGB tuple.
            # Use the name to retrieve its list, rather than calculating where
            # that species would start and end in one combined particle list.
            for kind, color in COLORS.items():
                # *color unpacks (R, G, B) into three arguments; 150 is alpha.
                # All segments drawn for this group use this translucent color.
                trail_layer.stroke(*color, 150)
                # This is the same list filled during reset_particles().
                # Iterating gives each existing Particle object directly.
                species_particles = particles_by_kind[kind]
                for particle in species_particles:
                    # Retired particles remain in the list but need no drawing
                    # or motion work. Their already-drawn trails stay visible.
                    if particle.active:
                        # Remember where this short segment should begin.
                        x, y = particle.x, particle.y
                        # Change the particle's velocity, position, and perhaps
                        # active flag using the motion rules in its class.
                        particle.update(dt)
                        # != means "not equal." Compare the new coordinate pair
                        # with the saved pair and draw only if movement occurred.
                        # A particle absorbed before moving adds no segment;
                        # one that just crossed the boundary can add its last one.
                        if (particle.x, particle.y) != (x, y):
                            trail_layer.line(x, y, particle.x, particle.y)
            # -= subtracts the processed interval. If time remains, the while
            # loop advances every active particle through the next small piece.
            remaining -= dt
        # Complete the batch of new lines before displaying the trail image.
        trail_layer.end_draw()

    # Compose the visible frame from back to front. The opaque white
    # environment covers the previous window image, then the transparent
    # trail surface overlays all paths accumulated in this burst.
    # (0, 0) places each image at the window's top-left corner.
    # These calls also run while paused, displaying the same stored surfaces.
    py5.image(environment, 0, 0)
    py5.image(trail_layer, 0, 0)


# py5 calls this event handler when a key is pressed in the sketch window.
def key_pressed():
    # The handler can replace the shared pause flag and previous clock reading.
    global paused, last_time
    # Convert the key value to text and lowercase it so R and r act alike.
    key = str(py5.key).lower()
    # A string containing one space represents the space bar.
    if key == " ":
        # Toggle: True becomes False, and False becomes True.
        paused = not paused
        # Restart the frame-time reference when toggling to avoid counting the
        # interval before the toggle as part of the next movement update.
        last_time = time.perf_counter()
    # R creates a fresh burst with a new origin, elements, and styles.
    # reset_particles() clears trails but preserves the current pause state.
    elif key == "r":
        reset_particles()


# Python sets __name__ to "__main__" when this file is executed as the main
# script. The companion particles.py launcher also explicitly uses that name.
# A normal import uses the module's name instead, so it defines the code above
# without automatically opening the graphics window through this block.
if __name__ == "__main__":
    # Start py5's sketch lifecycle: initialize the window, call setup(), then
    # keep calling draw() and dispatch keyboard events until the sketch stops.
    py5.run_sketch()
