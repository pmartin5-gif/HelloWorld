import math
import tempfile
import unittest
from pathlib import Path
import xml.etree.ElementTree as ET

from fractal_geometry import Fractal


class GeometryTests(unittest.TestCase):
    def test_recursive_attachment_and_length(self):
        model = Fractal(seed=8)
        model.advance(100)
        self.assertTrue(model.completed)
        self.assertGreater(model.generation, 8)
        for branch in model.branches:
            self.assertGreaterEqual(branch.length, model.min_length)
            self.assertEqual(branch.endpoint(0), (branch.x, branch.y))
            if branch.parent is not None:
                parent = model.branches[branch.parent]
                self.assertEqual((branch.x, branch.y), parent.endpoint())
                parent_scale = (model.root_scales[branch.parent]
                                if parent.generation == 0 else parent.length)
                self.assertLess(branch.length, parent_scale)
                self.assertEqual(branch.generation, parent.generation + 1)
                # Smooth organic curves deviate from a straight midpoint.
                midpoint = branch.endpoint(.5)
                end = branch.endpoint()
                self.assertGreater(math.hypot(midpoint[0] - (branch.x + end[0]) / 2,
                                              midpoint[1] - (branch.y + end[1]) / 2), 0)

    def test_growth_is_independent_of_time_step(self):
        large_step, small_steps = Fractal(seed=7), Fractal(seed=7)
        large_step.advance(4.7)
        for _ in range(470):
            small_steps.advance(.01)
        self.assertEqual(large_step.generation, small_steps.generation)
        self.assertEqual(len(large_step.branches), len(small_steps.branches))
        for a, b in zip(large_step.branches, small_steps.branches):
            self.assertAlmostEqual(a.progress, b.progress)
            for x, y in zip(a.endpoint(a.progress), b.endpoint(b.progress)):
                self.assertAlmostEqual(x, y)

    def test_bounded_growth_and_svg(self):
        model = Fractal(seed=8)
        model.advance(100)
        snapshot = len(model.branches)
        model.advance(100)
        self.assertEqual(len(model.branches), snapshot)
        self.assertLess(model.generation, 30)
        self.assertLess(len(model.branches), 50000)
        for branch in model.branches:
            x, y = branch.endpoint()
            self.assertLessEqual(math.hypot(x, y), 105 / (1 - .82) + 1e-8)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'drawing.svg'
            model.save_svg(output)
            svg = ET.parse(output).getroot()
            self.assertEqual(len(svg.findall('.//{http://www.w3.org/2000/svg}path')),
                             len(model.branches))

    def test_different_seeds_produce_different_growth(self):
        first, second = Fractal(seed=1), Fractal(seed=2)
        self.assertNotEqual(first.branches[0].endpoint(), second.branches[0].endpoint())

    def test_first_fork_is_early_and_close_to_center(self):
        model = Fractal(seed=8)
        model.advance(.51)
        self.assertEqual(model.generation, 1)
        for branch in model.branches[:6]:
            self.assertLess(math.hypot(*branch.endpoint()), 30)
        # Later growth retains its previous scale.
        self.assertGreater(max(branch.length for branch in model.active), 60)


if __name__ == '__main__':
    unittest.main()
