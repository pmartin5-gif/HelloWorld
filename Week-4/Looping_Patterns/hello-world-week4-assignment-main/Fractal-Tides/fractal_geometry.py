"""Organic radial branching, independent of the animation window."""

from dataclasses import dataclass
import math
from pathlib import Path
import random


@dataclass
class Branch:
    x: float
    y: float
    angle: float
    length: float
    generation: int
    end_angle: float
    delay: float
    parent: int | None = None
    progress: float = 0.0

    @property
    def stroke_width(self):
        return max(.16, .38 * (self.length / 100) ** .18)

    def control_points(self):
        # An airway-like curve leaves the fork smoothly and gently changes
        # direction, rather than drawing a straight geometric segment.
        heading = (self.angle + self.end_angle) / 2
        end = (self.x + math.cos(heading) * self.length,
               self.y + math.sin(heading) * self.length)
        first = (self.x + math.cos(self.angle) * self.length * .36,
                 self.y + math.sin(self.angle) * self.length * .36)
        second = (end[0] - math.cos(self.end_angle) * self.length * .36,
                  end[1] - math.sin(self.end_angle) * self.length * .36)
        return (self.x, self.y), first, second, end

    def endpoint(self, progress=1.0):
        points = self.control_points()
        t = max(0, min(1, progress))
        weights = ((1-t)**3, 3*(1-t)**2*t, 3*(1-t)*t*t, t**3)
        return tuple(sum(point[axis] * weight for point, weight in zip(points, weights))
                     for axis in (0, 1))

    def visible_points(self):
        # Small twigs need fewer samples; long stems stay smoothly curved.
        samples = max(2, min(14, math.ceil(self.length / 7)))
        return [self.endpoint(self.progress * i / samples)
                for i in range(samples + 1)]


class Fractal:
    """A radial seed becomes an irregular, curving network of finer twigs.

    A longer continuation and shorter side branch make each fork asymmetric.
    Subpixel branches are pruned before allocation: a full binary tree of 30
    generations would contain billions of invisible branches.
    """

    def __init__(self, seed=None):
        self.random = random.Random(seed)
        self.generations = 30
        self.min_length = .85
        self.generation = 0
        self.elapsed = 0.0
        self.completed = False
        self.branches = []
        self.root_scales = []
        rotation = self.random.uniform(0, math.tau)
        for index in range(6):
            angle = rotation + index * math.tau / 6 + self.random.uniform(-.18, .18)
            scale = self.random.uniform(80, 105)
            self.root_scales.append(scale)
            self.branches.append(Branch(
                0, 0, angle, scale * .28, 0,
                angle + self.random.uniform(-.25, .25), self.random.uniform(0, .16),
            ))
        self.active = list(self.branches)

    @property
    def duration(self):
        if self.generation == 0:
            return .5 / 1.5
        return max(.65, 1.8 * .95 ** self.generation) / 1.5

    def advance(self, dt):
        if not math.isfinite(dt) or dt < 0:
            raise ValueError("Time step must be finite and nonnegative.")
        # Consume excess time across generation boundaries: animation speed
        # stays independent of the machine's frame rate.
        while dt > 0 and not self.completed:
            remaining = self.duration - self.elapsed
            used = min(dt, remaining)
            self.elapsed += used
            dt -= used
            progress = min(1.0, self.elapsed / self.duration)
            for branch in self.active:
                branch.progress = max(0, (progress - branch.delay) / (1 - branch.delay))
            if self.elapsed >= self.duration:
                if self.generation + 1 == self.generations:
                    self.completed = True
                    self.active = []
                    break
                children = []
                first_parent = len(self.branches) - len(self.active)
                for parent_index, branch in enumerate(self.active, start=first_parent):
                    x, y = branch.endpoint()
                    dominant_side = self.random.choice((-1, 1))
                    # Slowly varying directional drift gives nearby branches
                    # related curves without imposing sixfold symmetry.
                    drift = .08 * math.sin(x / 80) * math.cos(y / 95)
                    for side in (dominant_side, -dominant_side):
                        dominant = side == dominant_side
                        ratio = self.random.uniform(.74, .82) if dominant else self.random.uniform(.44, .58)
                        # Short seed stems fork early without shrinking the
                        # entire network's later branches.
                        parent_scale = (self.root_scales[parent_index]
                                        if branch.generation == 0 else branch.length)
                        length = parent_scale * ratio
                        if length < self.min_length:
                            continue
                        opening = self.random.uniform(.13, .32) if dominant else self.random.uniform(.42, .72)
                        end_angle = branch.end_angle + side * opening + drift
                        children.append(Branch(
                            x, y, branch.end_angle + side * opening * .25,
                            length, branch.generation + 1,
                            end_angle, self.random.uniform(0, .24), parent_index,
                        ))
                if not children:
                    self.active = []
                    self.completed = True
                    break
                self.branches.extend(children)
                self.active = children
                self.generation += 1
                self.elapsed = 0.0

    def save_svg(self, path):
        """Export the visible drawing as crisp, editable vector lines."""
        visible = [branch for branch in self.branches if branch.progress > 0]
        points = [(0.0, 0.0)]
        for branch in visible:
            points.extend(branch.visible_points())
        left = min(x for x, y in points) - 24
        top = min(y for x, y in points) - 24
        width = max(x for x, y in points) - left + 24
        height = max(y for x, y in points) - top + 24
        lines = [
            '<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="{left:.4f} {top:.4f} {width:.4f} {height:.4f}">',
            f'<rect x="{left:.4f}" y="{top:.4f}" width="{width:.4f}" '
            f'height="{height:.4f}" fill="white"/>',
            '<g fill="none" stroke="black" '
            'stroke-linecap="round" stroke-linejoin="round">',
        ]
        for branch in visible:
            points = branch.visible_points()
            commands = [f'M {points[0][0]:.4f},{points[0][1]:.4f}']
            commands.extend(f'L {x:.4f},{y:.4f}' for x, y in points[1:])
            lines.append(f'<path stroke-width="{branch.stroke_width:.4f}" '
                         f'd="{" ".join(commands)}"/>')
        lines.extend(('</g>', '</svg>'))
        Path(path).write_text('\n'.join(lines) + '\n', encoding='utf-8')
