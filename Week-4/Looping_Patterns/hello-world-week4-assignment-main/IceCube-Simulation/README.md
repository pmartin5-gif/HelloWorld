# South Pole / IceCube

A standalone Python/py5 animation of a wave of particles arriving from space
above the Antarctic ice. The side view makes penetration through the ice
visible. It starts with 900 primary particles in one wave; there is no
continuous primary emission. All primary and secondary paths stay visible.

## Run

The project lives in `hello-world-week4-assignment-main/IceCube-Simulation`.
From the assignment folder, use your existing working py5 Python environment:

```bash
python -m pip install -r IceCube-Simulation/requirements.txt
python IceCube-Simulation/icecube.py
```

Or run these commands from inside `IceCube-Simulation`:

```bash
python -m pip install -r requirements.txt
python icecube.py
```

Java 17 or newer is also required; Java 21 is recommended. No external image,
font, or data paths are needed. See [py5 installation](https://py5coding.org/content/install.html).

- Space pauses/resumes.
- R clears the drawing and starts a fresh incoming wave.
- H toggles explanatory labels. Labels are off initially.

## What to look for

- **Ochre protons:** most terminate in atmospheric showers. A small portion
  of the shower energy is represented by secondary muons; any primary protons
  reaching the ice are stopped near its surface.
- **Teal photons:** an illustrative optical-like population scatters and is
  absorbed near the ice surface. This is not a gamma-ray shower calculation.
- **Violet neutrinos:** nearly all pass through the entire visible ice column
  without slowing or scattering. A deliberately amplified small fraction
  interacts in the detector region and produces a charged secondary.
- **Slate blue muons:** charged secondaries from neutrino interactions and
  atmospheric cosmic-ray showers; they can penetrate deep into the ice.
- **Blue light and sensor flashes:** schematic Cherenkov light from charged
  secondaries, registered by nearby optical sensors. Neutrinos are not seen
  directly, and atmospheric muons can also trigger sensors.

The display speed is shared across species. The visual difference is how far
particles penetrate before interacting, rather than a claim that photons
travel more slowly than neutrinos.

The diagram shows representative sensor strings between 1,450 and 2,450 m,
not all 86 real strings or 5,160 optical modules. Ice depths are mapped to
screen coordinates, while atmospheric heights, attenuation lengths,
particle fluxes, scattering angles, secondary production, light propagation,
and neutrino event frequency are simplified/exaggerated. Neutrino energies
and Earth absorption are not modeled. The model samples the visible rare
neutrino events in the deep detector region, rather than simulating a full
interaction distribution throughout the ice. Blue cones and coincidence
counts are explanatory effects, not calibrated reconstructions or trigger logic.

## Adjust

Change `PARTICLES_PER_TYPE`, `SIMULATION_SPEED`, and
`NEUTRINO_INTERACTION_FRACTION` near the top of `icecube.py`. The latter is set
to 0.015 so occasional detections are visible in a small demonstration;
it is not a measured IceCube interaction probability. Mean free paths for the
other species are visual distances in `Particle.__init__`.

## Sources

- [IceCube detection mechanism](https://icecube.wisc.edu/science/icecube/)
- [IceCube detector facts and sensor depths](https://icecube.wisc.edu/about-us/facts/)
- [Cosmic rays, atmospheric showers, and deep muons](https://icecube.wisc.edu/science/research/)
- [How neutrino interactions create detectable secondary tracks](https://masterclass.icecube.wisc.edu/en/icecube-and-neutrinos/detecting-neutrinos/)

The 2015 neutrino Nobel Prize recognized Takaaki Kajita (Super-Kamiokande)
and Arthur McDonald (Sudbury Neutrino Observatory), rather than IceCube:
[Nobel announcement](https://www.nobelprize.org/prizes/physics/2015/press-release/).
