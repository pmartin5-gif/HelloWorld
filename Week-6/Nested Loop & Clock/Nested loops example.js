// so what i'm trying to do is use the nested loop to cycle through one pixel at a time.
// at a regular interval, each pixel will be iterated.
// then i'm going to draw shapes corresponding to numbers to display a clock
// and on each interval of the loop, the pixels within those numbers will be weighted to stand out
// and so the image will display the current time

// this establishes the size of the grid and the size of the pixels
let pixelGrid = [];
const rows = 25;
const cols = 50;
const pixelSize = 20;

// assigns a value to the current pixel
let currentPixel = 0;

// codex tells me to add the below to shape the text that's being displayed. weird...

const digitShapes = {
  "0": ["#####", "#   #", "#   #", "#   #", "#   #", "#   #", "#####"],
  "1": ["  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"],
  "2": ["#####", "    #", "    #", "#####", "#    ", "#    ", "#####"],
  "3": ["#####", "    #", "    #", "#####", "    #", "    #", "#####"],
  "4": ["#   #", "#   #", "#   #", "#####", "    #", "    #", "    #"],
  "5": ["#####", "#    ", "#    ", "#####", "    #", "    #", "#####"],
  "6": ["#####", "#    ", "#    ", "#####", "#   #", "#   #", "#####"],
  "7": ["#####", "    #", "    #", "   # ", "  #  ", " #   ", "#    "],
  "8": ["#####", "#   #", "#   #", "#####", "#   #", "#   #", "#####"],
  "9": ["#####", "#   #", "#   #", "#####", "    #", "    #", "#####"],
  ":": [" ", "#", " ", " ", "#", " ", " "]
};

const shapeScale = 2;

function setup() {
  // the canvas is set to the size of of each pixel * the number of rows and columns
  createCanvas(cols * pixelSize, rows * pixelSize);
  // background sets the background color. having one number instructs it to render a grayscale.
  // to choose a specific color, you need three numbers (red, green, blue)
  frameRate((rows *cols) / 20);
  background(240);

  // this is the nested loop in setup. i still barely understand this.
  for (let y = 0; y < rows; y++) {
    pixelGrid[y] = [];
    for (let x = 0; x < cols; x++) {
      pixelGrid[y][x] = new CustomPixel(x, y, pixelSize);
    }
  }
}

function makeTimeShape() {
  let hourText = String(hour()).padStart(2, "0");
  let minuteText = String(minute()).padStart(2, "0");
  let timeText = hourText + ":" + minuteText;

  let shape = [];

  for (let row = 0; row < 7; row++) {
    let patternRow = "";

    for (let character = 0; character < timeText.length; character++) {
      let symbol = timeText[character];

      patternRow += digitShapes[symbol][row];

      if (character < timeText.length -1) {
        patternRow += " ";
      }
    }
    shape.push(patternRow);
  }
  return shape;
}


function draw() {
  let timeShape = makeTimeShape();
  if (currentPixel >= rows * cols) {
    currentPixel = 0;
  }
  // this is the nested loop in draw. the difference between this and the example code provided
  // is that it creates a variable called pixelNumber which assigns each pixel a unique value to each pixel
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let pixelNumber = y * cols + x;

      // this cycles through each pixel and assigns it a random color
      if (pixelNumber === currentPixel) {
          // Find where the lettering should start to center it.
          let startX = floor((cols - timeShape[0].length * shapeScale) / 2);
          let startY = floor((rows - timeShape.length * shapeScale) / 2);          

          // Convert this pixel's grid position into a pattern position.
          let shapeX = floor((x - startX) / shapeScale);
          let shapeY = floor((y - startY) / shapeScale);

          // Check that the position is within the pattern,
          // then check whether that position contains a #.
          let insideShape =
            shapeY >= 0 &&
            shapeY < timeShape.length &&
            shapeX >= 0 &&
            shapeX < timeShape[0].length &&
            timeShape[shapeY][shapeX] === "#";

        pixelGrid[y][x].randomizeColor(insideShape);
        pixelGrid[y][x].display();
      }
    }
  }
  currentPixel++;
}

class CustomPixel {
  constructor(x, y, size) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.color = color(random(255), random(255), random(255));
  }

  randomizeColor(insideShape) {
    if (insideShape) {
      this.color = color(random(180, 255), random(0, 150), random(180, 255));
    } else {
      this.color = color(random(0, 135), random(255), random(0, 135));
    }
  }

  display() {
    noStroke();
    fill(this.color);
    rect(
      this.x * this.size,
      this.y * this.size,
      this.size - 1,
      this.size - 1
    );
  }
}