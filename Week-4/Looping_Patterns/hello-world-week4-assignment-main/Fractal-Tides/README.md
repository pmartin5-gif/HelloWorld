# Fractal Tides

Fine black lines grow outward from a central seed on white. Six irregular
short stems fork close to the center, then curve and
split into unequal continuations and side branches. Small
variations in length, direction, and growth timing create an organic network
inspired by lung airways, vascular branching, and plant growth.

## Run

```bash
python3 /Users/pmartin5/Documents/GitHub/HelloWorld/Week-4/Looping_Patterns/hello-world-week4-assignment-main/Fractal-Tides/app.py
```

The project uses Python's standard library and Tkinter. No extra packages or
Java are required. Close an older window and relaunch to load changes.

## Growth and controls

The drawing starts automatically. It keeps branching for up to 30 generations,
pruning each twig once its planned length is below 0.85 drawing units. This is
less than one screen pixel at the initial zoom. Most runs finish around the
20th generation as the remaining twigs become invisible. Completed paths stay
on screen. Line widths taper from about 0.38 to 0.16 drawing units.

Every restart generates a new arrangement. There are no pattern or generation
selectors. The remaining controls are:

- **Space / Pause:** pause or resume growth.
- **R / Restart:** begin a fresh organic drawing.
- **Speed:** change the pace without changing the structure. The default
  multiplier is 0.7; splits now occur 50% faster than in the preceding version.
- **Zoom:** move closer to or farther from the drawing without restarting.
  The starting zoom is 1.35, 50% closer than the preceding version.
- **S / Save SVG:** save the current drawing as vector lines on white.
- **Escape:** close the window.

SVG export preserves the thin, tapered strokes at any resolution. On-screen
hairlines depend on Tkinter and the display's pixel resolution. Branches
pruned below the size cutoff are not restored by zooming in.

## Terminal export

Export a completed drawing without opening a window:

```bash
python3 /Users/pmartin5/Documents/GitHub/HelloWorld/Week-4/Looping_Patterns/hello-world-week4-assignment-main/Fractal-Tides/app.py --export organic.svg
```

Add `--seed 8` for a repeatable arrangement. With a seed, Restart repeats that
same arrangement. Export paths are relative to the terminal's current folder;
saving to an existing path replaces it.

## Design and references

This is an artistic branching model inspired by nature. It expands radially
from the earlier crystal seed, with smooth curves and asymmetric forks in
place of regular geometric symmetry. Tiny branches are culled before creation
so deep recursion remains practical.

Reviewed the original and converted Form+Code aggregation sketch,
`particles_original.py`, `particles.py`, `cosmic_particles.py`, and the IceCube
particle project in the HelloWorld folder. The original particles sketch
informs the delicate monochrome style; the aggregation sketch informs growth
from a seed; the other particle projects inform permanent paths and motion.

`fractal_geometry.py` contains organic branching and SVG export. `app.py`
contains the animation and controls. Run the checks with:

```bash
cd /Users/pmartin5/Documents/GitHub/HelloWorld/Week-4/Looping_Patterns/hello-world-week4-assignment-main/Fractal-Tides
python3 -m unittest -v test_geometry
```
