"""Launch the current cosmic simulation beside this file.

The original particle sketch is preserved in particles_original.py.
"""

# The triple-quoted text above is the module's docstring: a description Python
# makes available to documentation tools. Lines beginning with #, like this
# one, are comments for readers and do not perform any actions.
#
# This file is a launcher, meaning its job is to start another Python file.
# The particle movement, drawing, and simulation settings are implemented in
# cosmic_particles.py. Keeping this launcher lets particles.py remain a useful
# starting point even though the simulation now has a different filename.
#
# An import makes code from another module available in this file.
# pathlib is part of Python's standard library, so it needs no extra install.
# Path represents a filesystem path and provides methods for working with it.
# "from ... import ..." brings in just the named item, letting us write Path
# below instead of having to write pathlib.Path.
from pathlib import Path
# runpy is also part of the standard library. It can execute Python code from
# a file within the Python process that is already running this launcher.
# This form of import brings in the module; we access its function using a dot:
# runpy.run_path means "the run_path function belonging to runpy."
import runpy


# Python sets __name__ automatically for each module it executes.
# When you run this file directly, for example with "python particles.py",
# its __name__ is "__main__". When another file imports it, its __name__ is
# normally the module name instead, so importing it does not start the sketch.
# The == operator compares two values. If they match, Python runs the indented
# block below. The colon starts that block; indentation marks which lines belong
# to it. Names such as __name__ have double underscores because Python gives
# them a special meaning; these underscores are part of the variable's name.
if __name__ == "__main__":
    # run_path reads and executes the Python file identified by its first
    # argument. This runs the simulation in this process; it does not open a
    # terminal or launch a separate Python process.
    # The parentheses let this function call continue across several lines.
    runpy.run_path(
        # Read the expression below from the inside outward:
        #   __file__ is the path Python provides for this launcher file.
        #   Path(__file__) wraps that path in a Path object.
        #   .resolve() makes it absolute and resolves symbolic links, if any.
        #   .with_name("cosmic_particles.py") replaces the last filename while
        #       keeping the resolved parent directory. It returns a new path;
        #       it does not rename or change either file on disk.
        #   str(...) converts the resulting Path object to a text string for
        #       run_path to use as the filename.
        # This locates the simulation beside the resolved launcher file,
        # regardless of which folder your terminal is currently working in.
        # The comma separates this first argument from the next one.
        str(Path(__file__).resolve().with_name("cosmic_particles.py")),
        # This is a keyword argument: run_name is the parameter's name and
        # "__main__" is the value we supply. The single = supplies an argument;
        # unlike == in the if statement, it does not compare two values.
        # run_name tells run_path what __name__ to give the executed file.
        # Setting it to "__main__" allows the simulation's own main guard
        # (an if statement like the one above) to run its startup code.
        # The trailing comma is valid Python and is convenient in multiline
        # calls; it does not add another argument.
        run_name="__main__",
    # This closing parenthesis ends the run_path call. Execution continues
    # here only after that call returns normally; an unhandled error in the
    # launched code propagates to the launcher instead.
    )
