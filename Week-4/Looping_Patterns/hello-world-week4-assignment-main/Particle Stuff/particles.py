"""Launch the current cosmic simulation beside this file.

The original particle sketch is preserved in particles_original.py.
"""

from pathlib import Path
import runpy


if __name__ == "__main__":
    runpy.run_path(
        str(Path(__file__).resolve().with_name("cosmic_particles.py")),
        run_name="__main__",
    )
