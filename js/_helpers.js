// .: Helper Functions used in main _icv.js script - predominantly array operations and UI :.
// 
// .: Alex Conway :.
// 

//# MENU UI
//dashboard menu cllick
// <div class="toggles_left" style="float:left;">
//     <span class="slider_label">LEFT CANVAS</span>
//     <div class='toggle toggle_active' id='toggle_image'>Image + Circles</div>
//     <div class='toggle' id='toggle_edges'>Detected Edges</div>
// </div>
// <div class="toggles_right" style=" float:right;">
//     <span class="slider_label">RIGHT CANVAS</span>
//     <div class='toggle toggle_active' id='toggle_slice'>Accumulator Slice</div>
//     <div class='toggle' id='toggle_max'>Max Accumulator</div>
// </div>
// 
// <canvas id="img_canvas"></canvas>
// <canvas id="binary_canvas"></canvas>
// <canvas id="edges_canvas"></canvas>
// <canvas id="accumulator_canvas"></canvas>
// <canvas id="max_canvas"></canvas>

function toggleActive() {
    // if not active
    if (!$("#toggle_image").hasClass('toggle_active')) {
        // make active and remove active from other toggle
        $("#toggle_image").addClass("toggle_active");
        $("#toggle_edges").removeClass("toggle_active");
        //
        $("#edges_canvas").fadeOut("fast");
    }
}

function toggleEdges() {
    // if not active
    if (!$("#toggle_edges").hasClass('toggle_active')) {
        // make active and remove active from other toggle
        $("#toggle_edges").addClass("toggle_active");
        $("#toggle_image").removeClass("toggle_active");
        //
        $("#edges_canvas").fadeIn("fast");
    }
}

function toggleSlice() {
    // if not active
    if (!$("#toggle_slice").hasClass('toggle_active')) {
        // make active and remove active from other toggle
        $("#toggle_slice").addClass("toggle_active");
        $("#toggle_max").removeClass("toggle_active");
        //
        $("#max_canvas").fadeOut("fast");
    }
}

function toggleMax() {
    // if not active
    if (!$("#toggle_max").hasClass('toggle_active')) {
        // make active and remove active from other toggle
        $("#toggle_max").addClass("toggle_active");
        $("#toggle_slice").removeClass("toggle_active");
        //
        $("#max_canvas").fadeIn("fast");
    }
}

// # DEBUG
// log to console all accumulators (radii = levels of accumulators array) at given coordinates
function logAccumulatorAtPixel(pixel_y, pixel_x) {
    // if inside canvas
    if (hover_x > 0 && hover_y > 0) {
        // 
        console.log("Log Pixel at (" + pixel_x + "," + pixel_y + ")");
        //
        for (var k = 0; k < accumulators.length; k++) {
            //      console.log("k: " + k + " r: " + accumulator_radius_lookup[k] + " intensity: " + accumulators[k][pixel_x][pixel_y].toFixed(2));
        }
        console.log("Pixel max intensity: " + accumulator_max[pixel_x][pixel_y].toFixed(2));
        console.log("Pixel max radius: " + accumulator_max_radius[pixel_x][pixel_y]);
        console.log("Pixel max index: " + accumulator_max_index[pixel_x][pixel_y]);

        var u2 = -0.5;
        var d2 = -0.5;
        var k = accumulator_max_index[pixel_x][pixel_y];
        try {
            u2 = accumulators[k + 2][pixel_x][pixel_y] / accumulators[k][pixel_x][pixel_y] - 1;
            d2 = accumulators[k - 2][pixel_x][pixel_y] / accumulators[k][pixel_x][pixel_y] - 1;
        } catch (e) {}

        console.log("u2 " + u2.toFixed(2));
        console.log("d2 " + d2.toFixed(2));
    }
}


// ## Convert RGBA imageData.data object to 2d binary pixel array
// much easier to do convolutions etc. on 2d binary image matrix than on a 1d RGBA array 
// essentially just converting 1d array to 2d matrix with width x height dimensions
//  except only keep every 4th element of RGBA input data object
function toArr(data) {
    // array with number elements = width of image, each an array with dimension = height representing row of matrix 
    var arr = [];
    for (var r = 0; r < height; r++) {
        arr[r] = [];
        for (var c = 0; c < width; c++) {
            // the trick is that imageData.data is RGBA - having binarized it, R = G = B but we want binary array to just have one of these
            arr[r][c] = data[4 * ((r * width) + c)];
        }
    }
    return arr;
}


// ## Flatten 2D array into 1D array 
// makes much easier to convert binary 2D matrix back into RGBA imageData.data object
function toFlatArr(arr) {
    var flattened = [];

    for (var i = 0; i < arr.length; i++) {
        flattened = flattened.concat(arr[i]);
    }
    return flattened;
}




// ## Draw circle in canvas using midpoint algorithm
// References:
// 1. http://en.wikipedia.org/wiki/Midpoint_circle_algorithm
// 2. http://codepen.io/sdvg/pen/oFACy
var paintCircle = function(y0, x0, radius, colour) {
    ctx.fillStyle = colour;
    var x = radius;
    var y = 0;
    var radiusErr = 1 - x;

    // draw discretized circle arc
    while (x >= y) {
        // fill pixels on circle arc
        paintPixel(x + x0, y + y0);
        paintPixel(y + x0, x + y0);
        paintPixel(-x + x0, y + y0);
        paintPixel(-y + x0, x + y0);
        paintPixel(-x + x0, -y + y0);
        paintPixel(-y + x0, -x + y0);
        paintPixel(x + x0, -y + y0);
        paintPixel(y + x0, -x + y0);
        y++;

        // off-arc adjustment
        if (radiusErr < 0) {
            radiusErr += 2 * y + 1;
        } else {
            x--;
            radiusErr += 2 * (y - x + 1);
        }
    }

    // draw circle center
    paintPixel(x0, y0);
    paintPixel(x0 + 1, y0);
    paintPixel(x0 - 1, y0);
    paintPixel(x0, y0 + 1);
    paintPixel(x0, y0 - 1);
    //
    paintPixel(x0 + 2, y0);
    paintPixel(x0 - 2, y0);
    paintPixel(x0, y0 + 2);
    paintPixel(x0, y0 - 2);
    paintPixel(x0 + 3, y0);
    paintPixel(x0 - 3, y0);
    paintPixel(x0, y0 + 3);
    paintPixel(x0, y0 - 3);

};
//
// fill single pixel on canvas
var paintPixel = function(x, y) {
    // fill pixel at (x,y) coordinates
    ctx.fillRect(x, y, 1, 1);
}



// My event listeners to report co-ordinates being hovered over broke when I overlaid the canvases :(
//
// // ## ADD EVENT LISTENERS TO UI
// // predominantly canvas elements reporting co-ordinates being hovered over and associated properties
// var hover_x;
// var hover_y;
// // add event to assist with debugging accumulator that triggers on keypress when hovering over canvas
// $(document).keypress(function(e) {
//     if (e.keyCode == 65) { // "A" key
//         logAccumulatorAtPixel(hover_x, hover_y);
//     }
// });
// //
// function addStatusEventListeners() {
//     // set default status
//     status_element.innerHTML = status_default;

//     // add coordinates event listeners to canvases 
//     // 1. img_canvas
//     img_canvas.addEventListener('mousemove', function(e) {
//         var x = e.pageX - img_canvas.offsetLeft;
//         var y = e.pageY - img_canvas.offsetTop;
//         //
//         hover_x = x;
//         hover_y = y;
//         //
//         if (x < border || y < border || y > height + border || x > width + border) {
//             status_text = 'Hovering over image border';
//         } else {
//             status_text = 'Hovering over image co-ordinates: X : ' + (y - border) + ', ' + 'Y :' + (x - border);
//         }
//         status_element.innerHTML = status_text;
//     }, 0);
//     //
//     img_canvas.addEventListener('mouseout', function(e) {
//         hover_x = -1; // disable keypress debug function trigger
//         status_element.innerHTML = status_default;
//     }, 0);


//     // 2. edges canvas
//     edges_canvas.addEventListener('mousemove', function(e) {
//         var x = e.pageX - edges_canvas.offsetLeft;
//         var y = e.pageY - edges_canvas.offsetTop;
//         //
//         hover_x = x;
//         hover_y = y;
//         //
//         if (x < border || y < border || y > height + border || x > width + border) {
//             status_text = 'Hovering over edge image border';
//         } else {
//             status_text = 'Hovering over edge image co-ordinates: X : ' + (y - border) + ', ' + 'Y :' + (x - border);
//         }
//         status_element.innerHTML = status_text;
//     }, 0);
//     //
//     edges_canvas.addEventListener('mouseout', function(e) {
//         hover_x = -1; // disable keypress debug function trigger
//         status_element.innerHTML = status_default;
//     }, 0);


//     // 3. accumulator canvas
//     accumulator_canvas.addEventListener('mousemove', function(e) {
//         var x = e.pageX - accumulator_canvas.offsetLeft;
//         var y = e.pageY - accumulator_canvas.offsetTop;
//         //
//         hover_x = x;
//         hover_y = y;
//         //
//         if (x < border || y < border || y > height + border || x > width + border) {
//             status_text = 'Hovering over accumulator border';
//         } else {
//             status_text = '(' + (y - border) + ', ' + (x - border) + ") votes = " + Math.round(accumulators[accumulator_slice][y][x]) + " at r = " + accumulator_radius_lookup[accumulator_slice] + "; max = " + Math.round(accumulator_max[y][x]) + " at r = " + accumulator_max_radius[y][x];
//         }
//         status_element.innerHTML = status_text;

//     }, 0);
//     //
//     accumulator_canvas.addEventListener('mouseout', function(e) {
//         hover_x = -1; // disable keypress debug function trigger
//         status_element.innerHTML = status_default;
//     }, 0);


//     // 4. max canvas
//     max_canvas.addEventListener('mousemove', function(e) {
//         var x = e.pageX - max_canvas.offsetLeft;
//         var y = e.pageY - max_canvas.offsetTop;
//         //
//         hover_x = x;
//         hover_y = y;
//         //
//         if (x < border || y < border || y > height + border || x > width + border) {
//             status_text = 'Hovering over accumulator border';
//         } else {
//             status_text = '(' + (y - border) + ', ' + (x - border) + ") has intensity = " + Math.round(accumulators[accumulator_slice][y][x]) + " at r = " + accumulator_radius_lookup[accumulator_slice] + "; max = " + Math.round(accumulator_max[y][x]) + " at r = " + accumulator_max_radius[y][x];
//         }
//         status_element.innerHTML = status_text;

//     }, 0);
//     //
//     max_canvas.addEventListener('mouseout', function(e) {
//         hover_x = -1; // disable keypress debug function trigger
//         status_element.innerHTML = status_default;
//     }, 0);
// }
