var backgroundColor;
var isOverRectangle; // boolean!

let rectWidth = 10;
let rectHeight = 30;

let x = 800;
let y = 485;
 
function setup() {
  // set canvas size
  createCanvas(800, 800);
  backgroundColor = color(0, 0, 0);


}
 
function draw() {
  background(backgroundColor);

  // Delete later - This is to show mouse coordinates during setup.
  let coordText = `X: ${mouseX}, Y: ${mouseY}`;
  
  // Delete later - This is also to show mouse coordinates during setup
  fill(255);
  strokeWeight(1);
  text(coordText, 20, 30);
  text(x, 20, 50);
  
  // draw the triangle
  stroke(255);
  strokeWeight(5);
  
  if(isOverRectangle == true) {
    fill(255, 165, 0);
    cursor(HAND); // change the cursor!
  } 
  else {
    fill(0); 
    cursor(ARROW); 
  }

  triangle(265, 373, 400, 169, 545, 373);

  // draw interaction space rectangle
  rect(375, 450, 50, 100);

  // draw moving rectangle
  fill(255, 255, 255);
  rect(x, y, rectWidth, rectHeight);

    if(x < -rectWidth) {
    x = width;
  }
  
  x -= 2;
  
// interaction when moving rectangle is in interaction space
  if(x > 375 && x < 425){
    if (keyIsDown(32)) {
      text("Success!", 50, 50);
    }
  }
}
 
function mousePressed() {
  // we check if we are over the rectangle when the mouse is pressed
  if(isOverRectangle == true) {
    backgroundColor = color(random(255), random(255), random(255));
  }
}