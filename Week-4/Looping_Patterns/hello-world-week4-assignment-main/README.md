# Looping Patterns Assignment

This assignment teaches you how to create generative art patterns using Python, focusing on loops, grids, and creative coding techniques.

## Setup Instructions

### macOS Setup

#### Prerequisites

Most students have installed Python on macOS using Homebrew. If you haven't already, install Homebrew from [brew.sh](https://brew.sh/).

#### Installation Steps

1. **Install Python dependencies via Homebrew:**

   ```bash
   brew install python-tk
   brew install freetype jpeg-turbo libavif libimagequant libraqm libtiff little-cms2 openjpeg webp
   ```

2. **Create a virtual environment:**

   ```bash
   python3 -m venv path/to/venv
   ```

   Replace `path/to/venv` with your desired location, e.g., `~/venvs/looping-patterns`

3. **Activate the virtual environment:**

   ```bash
   source path/to/venv/bin/activate
   ```

   You'll need to run this command each time you open a new terminal session.

4. **Install Python packages:**
   ```bash
   python3 -m pip install Pillow
   python3 -m pip install seaborn
   ```

### Windows Setup

#### Prerequisites

Python 3 should be installed on your Windows system. Download it from [python.org](https://www.python.org/downloads/) if needed. During installation, make sure to check "Add Python to PATH".

#### Installation Steps

1. **Install Python packages:**

   Open Command Prompt or PowerShell and navigate to your project folder:

   ```powershell
   cd path\to\hello-world-week4-assignment
   ```

2. **Create a virtual environment:**

   ```powershell
   python -m venv venv
   ```

3. **Activate the virtual environment:**

   In Command Prompt:
   ```cmd
   venv\Scripts\activate.bat
   ```

   In PowerShell:
   ```powershell
   venv\Scripts\Activate.ps1
   ```

   **Note:** If you get a permissions error in PowerShell, you may need to run:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

   You'll need to activate the virtual environment each time you open a new terminal session.

4. **Install Python packages:**
   ```powershell
   python -m pip install Pillow
   python -m pip install seaborn
   ```

   **Note:** Tkinter comes bundled with Python on Windows, so no additional installation is needed.

### Running the Examples

Once your environment is set up, you can run any of the example files.

**macOS/Linux:**
```bash
python3 looping-pattern-step1.py
python3 looping-pattern-step2.py
# ... and so on
```

**Windows:**
```powershell
python looping-pattern-step1.py
python looping-pattern-step2.py
# ... and so on
```

Press `Ctrl+C` or close the window to exit the program.

## Learning Path

The files are numbered to guide you through increasingly complex patterns:

- **step1**: Basic setup - draws a single red circle using PIL and Tkinter
- **step2**: Introduces `scaleFactor` scaling and LANCZOS resampling for anti-aliasing (creates smoother edges by rendering at higher resolution then downsampling)
- **step3**: Adds nested loops for 4×4 grid, introduces `drawCircle()` helper function, uses random RGB colors
- **step4**: Integrates seaborn color palettes (16 colors) for harmonious color schemes
- **step5**: Introduces `drawMultipleCircles()` using trigonometry (sin/cos) to arrange circles in circular patterns, adds alpha channel support, implements outline colors with configurable width, enables image saving
- **step6**: Full HD output (1920×1080), 16×9 grid layout, configurable alpha for fill and outline separately, produces high-resolution exports
- **fibonacci-spiral**: Bonus example using golden ratio mathematics (phi ≈ 1.618) to create a spiral with 800 circles positioned using polar coordinates and the golden angle (≈ 137.5°)

## Creating Your Own Patterns

### Using Different Shapes

The examples use circles, but you can create many other shapes using PIL's `ImageDraw` methods:

#### Rectangles

```python
# Instead of drawingContext.ellipse()
drawingContext.rectangle((x, y, x + width, y + height), fill=color, outline=outline_color)
```

#### Polygons (triangles, hexagons, stars, etc.)

```python
# Triangle
points = [(x, y), (x + 50, y), (x + 25, y + 50)]
drawingContext.polygon(points, fill=color, outline=outline_color)

# Hexagon
import math
def hexagon_points(center_x, center_y, radius):
    points = []
    for i in range(6):
        angle = math.pi / 3 * i
        px = center_x + radius * math.cos(angle)
        py = center_y + radius * math.sin(angle)
        points.append((px, py))
    return points

drawingContext.polygon(hexagon_points(x, y, 50), fill=color)
```

#### Lines

```python
drawingContext.line((x1, y1, x2, y2), fill=color, width=5)
```

#### Arcs and Chords

```python
# Arc (part of a circle's outline)
drawingContext.arc((x, y, x + 100, y + 100), start=0, end=180, fill=color)

# Chord (filled arc segment)
drawingContext.chord((x, y, x + 100, y + 100), start=0, end=180, fill=color)
```

### Design Ideas

Here are some ways to create interesting patterns:

1. **Mix shapes**: Use different shapes in alternating cells

   ```python
   if (i + j) % 2 == 0:
       drawCircle(...)
   else:
       drawRectangle(...)
   ```

2. **Vary sizes**: Make shapes grow or shrink across the grid

   ```python
   radius = 20 + (i * 10)  # Gets bigger as i increases
   ```

3. **Rotate patterns**: Use the angle in `drawMultipleCircles()` to create rotations

   ```python
   angle = (pi * 2 / number) + (i * pi / 8)  # Add rotation per row
   ```

4. **Layer transparency**: Use alpha values to create overlapping effects

   ```python
   drawCircle(x, y, radius, (*color, 128))  # 50% transparent
   ```

5. **Create gradients**: Interpolate between colors across the grid

   ```python
   # Fade from first color to last color
   color_index = int((i / 4) * len(palette))
   ```

6. **Combine with math**: Try sine waves, spirals, or random variations
   ```python
   y_offset = math.sin(i * 0.5) * 50  # Wave pattern
   ```

### Experimenting with Color

Seaborn offers many color palettes. Try these in your code:

```python
palette = list(sns.color_palette("viridis", 16).as_hex())
palette = list(sns.color_palette("magma", 16).as_hex())
palette = list(sns.color_palette("Spectral", 16).as_hex())
palette = list(sns.color_palette("coolwarm", 16).as_hex())
```

Browse more palettes at: [seaborn.pydata.org/tutorial/color_palettes.html](https://seaborn.pydata.org/tutorial/color_palettes.html)

## Understanding Key Techniques

### The Scaling Technique (Anti-Aliasing)

You'll notice all the example files use a `scaleFactor` variable (typically set to 4). This is a clever technique to create smoother edges:

1. The image is drawn at 4× the final size (e.g., 1600×1600 instead of 400×400)
2. Then it's downsampled back to the target size using LANCZOS resampling
3. This averaging process smooths out jagged edges, making circles and curves look much better

You can experiment with different scale factors: higher values = smoother but slower.

### Color Palette Conversion (step5+)

In step5 and beyond, seaborn's hex color palettes are converted to RGB tuples so we can add alpha (transparency) values:

```python
get_rgb = lambda x: list(int(x[i : i + 2], 16) for i in (0, 2, 4))
new_palette = [elem.replace("#", "") for elem in palette]
rgb_palette = list(map(get_rgb, new_palette))

# Now you can use it with alpha:
color_with_alpha = (*rgb_palette[0], 128)  # 50% transparent
```

## Tips

- Start with step1 or step3 and modify them incrementally
- Use `print()` statements to debug your loop values
- Save your images with `myImage.save("my-pattern.png", bitmap_format="png")`
- Increase `scaleFactor` for smoother edges (but slower rendering)
- Experiment! The best way to learn is to try things and see what happens

## Need Help?

If you encounter errors:

1. Make sure your virtual environment is activated
2. Check that all packages are installed:
   - macOS: `python3 -m pip list`
   - Windows: `python -m pip list`
3. Look at the error message - Python errors usually indicate the line number
4. Compare your code to the working examples

Happy coding!
