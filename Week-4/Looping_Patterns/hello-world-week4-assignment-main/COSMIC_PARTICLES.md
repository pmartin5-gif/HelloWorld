# Cosmic Passage

`cosmic_particles.py` draws ochre, teal, and violet particle paths on white,
without text labels or particle dots. Each startup and reset chooses a random
shared source, away from the three elements. Every species launches at evenly
spaced angles around a full circle, creating one simultaneous burst of 1,200
particles (400 of each type). No particles are emitted afterward. Absorbed
photons and particles leaving the canvas are permanently deactivated; they
are never replaced. Their full drawn paths remain visible permanently for
the duration of the burst, including after absorption or leaving the canvas.
Only pressing R explicitly starts a fresh burst and clears the old drawing.

The three abstract elements are gravity rings, a hatched dust circle, and
a magnetic circle with X symbols. Their placement, sizes, gravity strength,
ring counts, hatch spacing and orientation, and symbol styles are randomized
at startup and on R. They remain unshaded. Stars, shaded regions, the second
gravity well, and the supernova have been removed.

The simulation runs at 7.5% of its original speed, half the previous pace.
Continuous time steps keep movement smooth. Static elements are cached, and
new path segments are drawn once onto a persistent layer, so keeping complete
paths does not require redrawing their entire history every frame.

## Run

Use your existing Python environment. From this assignment folder:

```bash
python -m pip install -r requirements-cosmic.txt
python cosmic_particles.py
```

py5 also needs Java 17 or newer (Java 21 recommended). If needed, install Java
using the same Python environment:

```bash
python -m pip install install-jdk
python -c "import jdk; print('Java installed to:', jdk.install('21'))"
```

Restart your editor or notebook kernel after installing Java. An existing
`JAVA_HOME` must point to a compatible Java installation. See the
[py5 installation guide](https://py5coding.org/content/install.html).

There are no external images, fonts, or data files. No absolute paths are
embedded in the script. You can also run it from another directory by passing
its path to Python, quoting paths that contain spaces.

## Controls and customization

- Space: pause or resume.
- R: explicitly start a fresh burst with a new random shared source.
- Change `PARTICLES_PER_TYPE` to adjust the initial burst density. Paths have
  no length limit and persist until an explicit reset.
- Change `ORIGIN_MARGIN` to control how far the random source stays from the
  edges, and `SIMULATION_SPEED` to adjust the pace (`0.075` is the current pace; `1.0` is
  the original speed).
- Change `COLORS` or the ranges in `randomize_elements()` to customize the scene.

This is an illustrative animation with exaggerated scales, not a quantitative
astrophysics simulation. Gravity steers every particle type; magnetism turns
protons; dust slows and scatters protons and scatters or absorbs photons;
neutrinos pass through dust and magnetism.

`particles.py` also launches this cosmic simulation using a path relative to
its own location. The original Processing-to-Python adaptation is preserved
in `particles_original.py`. Close any already running animation and launch
the script again to load changes from disk.
