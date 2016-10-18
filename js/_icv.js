// .: Main Solution implementation - also see _helpers.js :. 
// 
// .: Alex Conway :.

// ## DEFAULTS
// hand-picked from trial & error - adjustable via GUI
var threshold = 121; // initial threshold to binarize image and edges 
var accumulator_cutoff = 61; // initial cutoff determining if intensity of point in (center_x, center_y, radius) 3d accumulator space is a circle
var accumulator_slice = 5; // initial index of accumulator to show
var accumulator_discretization_jump = 2; // pixels between radius layers
var r_max = 65; // max radius in detected circles 

// ## GLOBAL VARIABLES
var img;
var width, height;
var border; // "overflow" for accumulator
var bwidth, bheight; //width including border
//
var edges; // 2D matrix storing binary edge pixels resulting from Sobel filter
var grads; // 2D matrix storing binary edge gradient pixels resulting from Sobel filter
//
var edge_pixels; // Sparse matrix containing just the co-ordinates of edge pixels 
//
var radius; // radius of current accumulator slice (z-dim in 3d accumulator)

//
var accumulators; // array of 2D matrices, each representing an accumulator at that radius
var accumulator_max = []; // maximum value at each pixel seen in accumulators across all radii
var accumulator_max_radius = []; // radius corresponding to accumulator_max at each pixel
var accumulator_max_index = []; // matrix with each pixel showing index of accumulator corresponding to accumulator_max at that pixel
var accumulator_max_overall; // largest accumulator value across all radius layers
var accumulator_radius_lookup = []; // accumulator isn't every possible radius - this lookup lets match index of accumulator to radius therein
var accumulator_slice_max = []; // array with max intensity for each accumulator slice
var current_accumulator = 5; // index of accumulator currently being drawn in accumulator canvas
//
var circle_points; // these are the found circles
//
// canvas vars
var ctx; // canvas context
var img_canvas = document.getElementById("img_canvas");
var binary_canvas = document.getElementById("binary_canvas");
var edges_canvas = document.getElementById("edges_canvas");
var accumulator_canvas = document.getElementById("accumulator_canvas");
var max_canvas = document.getElementById("max_canvas");
//
var time_start; // for timing computation
var time_taken;

// ## UI
var status_element = document.getElementById('status');
var status_text;
var status_default = ":)";
//
var slider_threshold_widget;
var slider_radius_widget;
var slider_cutoff_widget;
var slider_radius_description = document.getElementById('slider_radius_description');
var slider_cutoff_description = document.getElementById('slider_cutoff_description');

// ## ADD EVENT TO FILE CHOOSER
// add event listener to file picker - trigger loadImage on file upload
var image_picker = document.getElementById("img_picker");
image_picker.addEventListener("change", function() {
    loadImage();
});

// ## create javascript interface components
createSliders();

// ## LOAD IMAGE FILE INTO CANVAS
// load image into canvas
function loadImage() {
    // Reference: http://jsfiddle.net/z3JtC/4/
    var input, file, fr;

    // error handling
    if (typeof window.FileReader !== 'function') {
        alert("The file API isn't supported on this browser yet - please please please use Chrome or Firefox :) ");
        return;
    }
    input = document.getElementById('img_picker');
    if (!input) {
        alert("Um, couldn't find the img_picker element.");
    } else if (!input.files) {
        alert("This browser doesn't seem to support the `files` property of file inputs - please please please use Chrome or Firefox :)");
    } else if (!input.files[0]) {
        alert("Please select a file before clicking 'Load'");
    } else {
        file = input.files[0];
        fr = new FileReader();
        fr.onload = createImage;
        fr.readAsDataURL(file);
    }

    // move file picker widget
    var img_canvas = $("#image_picker_container").css('top', '10px');
    img_canvas.css('margin-left', '100px;');

    // create new image object using filereader source
    // on success, trigger imageLoaded function and begin process
    function createImage() {
        img = new Image();
        img.onload = createCanvases;
        img.src = fr.result;
    }
}

// write to img_canvas once image has loaded 
function createCanvases() {
    $("#loaded").show();

    // set image dimension globals
    width = img.width;
    height = img.height;
    console.log("image loaded with w=" + width + ", h=" + height)

    // want some 'gutter' or 'border' around accumulator to account for circles on the edges which are centered off-image
    border = Math.ceil(0.2 * width);
    // width and height incl border - this is size of accumulators
    bwidth = width + (2 * border);
    bheight = height + (2 * border);

    // set canvas attributes based on loaded image
    img_canvas.width = width + (2 * border);
    img_canvas.height = height + (2 * border);

    // write image to canvas
    var ctx = img_canvas.getContext("2d");
    ctx.clearRect(0, 0, img_canvas.width, img_canvas.height);
    ctx.drawImage(img, border, border);
    img_data = img_canvas.toDataURL("image/png");

    // add event listeners to canvas that report hovered over co-ordinates etc.
    // see comment in _helpers.js
    // addStatusEventListeners();

    // move to next step in image processing pipeline - converting RGB image to inverted binary image by thresholding
    getBinary();
}

// ## GREYSCALE & THRESHOLD CANVAS IMAGE
// actual computation begins here
function getBinary() {
    console.log("begin binarizing image");
    // begin computation timer
    time_start = new Date().getTime();
    console.log("start computing " + time_start);

    // set context to image canvas and read image data 
    ctx = img_canvas.getContext("2d");
    var imageData = ctx.getImageData(border, border, width, height);
    var data = imageData.data;

    // greyscale image
    for (var i = 0; i < data.length; i += 4) {
        // determine greyscaled pixel value
        // based on weighted sum suggested at:
        // http://www.mathworks.com/help/matlab/ref/rgb2gray.html
        var brightness = 0.2989 * data[i] + 0.5870 * data[i + 1] + 0.1140 * data[i + 2];

        // binarize based on threshold - also invert pixels during thresholding by setting pixel to black if brightness >= threshold
        var pixel = 255;
        if (brightness >= threshold) pixel = 0;

        // binarize RGB channels
        // red
        data[i] = pixel;
        // green
        data[i + 1] = pixel;
        // blue
        data[i + 2] = pixel;
    }

    // write binarized image darta to binary_canvas
    ctx = binary_canvas.getContext("2d");
    binary_canvas.width = width + (2 * border);
    binary_canvas.height = height + (2 * border);
    ctx.clearRect(0, 0, binary_canvas.width, binary_canvas.height);
    ctx.putImageData(imageData, border, border);

    // initialize edge-detection step
    getEdges();
}

// ## EDGE DETECTION
// Horizontal and vertical Sobel convolution applied
// I also used a sparse edge data structure which led to a huge performance improvement 
// 
// References:
// 1. https://www.hackerearth.com/notes/thethunder666/canny-edge-detection/
// 2. https://github.com/cmisenas/canny-edge-detection/blob/master/js/canny.js
// 3. https://en.wikipedia.org/wiki/Sobel_operator
function getEdges() {
    console.log("begin finding edges");
    // read image data from context (context is now binary_canvas)
    var imageData = ctx.getImageData(border, border, width, height);
    var data = imageData.data;

    // convert imagedata to matrix
    var mat = toArr(data, width, height);

    // define Sobol convolution kernels 
    var sobel_x = [
        [-1, 0, 1],
        [-2, 0, 2],
        [-1, 0, 1]
    ];
    var sobel_y = [
        [1, 2, 1],
        [0, 0, 0],
        [-1, -2, -1]
    ];
    
    // create 2D array for sobel convolution output
    edges = [];
    grads = []; // for sobel gradient directions

    // iterate over pixels not on border, applying sobol filter to each
    for (var r = 0; r < height; r++) {
        // create new row in output 2D array
        edges[r] = [];
        grads[r] = [];

        // handle border cases - set all pixels to white
        for (var c = 0; c < width; c++) {
            if (c == 0 || c == width - 1 || r == 0 || r == height - 1) {
                // if on border, set output pixel equal to binarized pixel
                edges[r][c] = 255;
                grads[r][c] = 255;
            } else {
                // result of vertical sobol convolution
                var pixel_x = 0;
                var pixel_y = 0;
                //
                for (var i = 0; i < 3; i++) {
                    for (var j = 0; j < 3; j++) {
                        // x and y coordinates of pixel given convolution cell
                        var p_x = r + i - 1;
                        var p_y = c + j - 1;
                        // add convolution cell contributions
                        pixel_x += mat[p_x][p_y] * sobel_x[i][j];
                        pixel_y += mat[p_x][p_y] * sobel_y[i][j];
                    }
                }

                // compute sobel magnitude (sobel_pixel) 
                var sobel_pixel = Math.ceil(Math.sqrt((pixel_x * pixel_x) + (pixel_y * pixel_y)));
                // threshold sobel-pixel and store as edge
                if (sobel_pixel > threshold) {
                    edges[r][c] = 0;
                } else {
                    edges[r][c] = 255;
                }

                // compute sobel gradient - didn't end up using but would be required to finish canny edge detection
                // and can actually use grads as 'edges' to speed up calc - ended up using edges since fast enough and true to the hough transform
                var sobel_grad = 0;
                if (pixel_x != 0 && pixel_y != 0) sobel_grad = Math.atan(pixel_y / pixel_x);
                grads[r][c] = (sobel_grad * 255);
            }
        }
    }


    // Create sparse list of edge pixels
    // MUCH faster since need to draw circle around each pixel for multiple radii
    // and since most pixels are not edges, saves having to iterate through entire 
    // edge image for each radii
    edge_pixels = [];
    // Avoids having to pass through whole edge image on each radius pass
    for (var r = 0; r < height + (2 * border); r++) {
        for (var c = 0; c < width + (2 * border); c++) {
            // only need to fill accumulator based on edge points (excl borders but remember border offset on canvas)
            if (r > border && r < (height + border) && c > border && c < (width + border)) {
                // is an edge
                if (edges[r - border][c - border] == 0) {
                    // store (x,y) coordinates of edge pixel in edge_pixels array
                    edge_pixels.push({ xx: r, yy: c });
                }
            }
        }
    }


    // convert 2d matrix back to imageData object  to then write to canvas
    // first flatten 2d matrix
    var matflat = toFlatArr(edges);
    // now replace image data object with image matrix values
    var c = 0;
    for (var i = 0; i < data.length; i += 4) {
        data[i] = matflat[c];
        data[i + 1] = matflat[c];
        data[i + 2] = matflat[c];
        data[i + 3] = 255; //alpha always 255
        c++;
    }

    // write to canvas
    ctx = edges_canvas.getContext("2d");
    edges_canvas.width = width + (2 * border);
    edges_canvas.height = height + (2 * border);
    ctx.clearRect(0, 0, edges_canvas.width, edges_canvas.height);
    ctx.putImageData(imageData, border, border);

    // move to accumulator step of hough transform
    getAccumulator();
}


// ## Construct accumulator 
// circle parametrized by center coordinates and radius so 3 dimensional
// accumulators is array with an accumulator for each radius 
// accumulator is just same dimensions as image (incl borders) storing 'votes'
// for circle parameters by drawing circle around each edge pixel since 
// the intersection of many of these circles in Hough space will be the center of a 
// circle in the original image at that given radius where the accumulator has 
// an abundance of 'votes' (high values)
function getAccumulator() {
    console.log("begin creating accumulators");

    // initialize blank array to store set of accumulators
    // each accumulator corresponds to a given circle radius
    // these are in steps of 5 pixels
    accumulators = [];

    // iterate over edge pixels and draw circle into accumulator array
    // ai = accumulator_index
    // maps which radius calculated which accumulator in array of accumulators
    // see  accumulator_discretization_jump = pixels between radius layers defined in defaults section at top
    for (var ai = 0; ai < Math.ceil(r_max / accumulator_discretization_jump); ai++) {

        // radius for this accumulator
        radius = Math.ceil((ai + 1) * accumulator_discretization_jump);

        // add to accumulator_index : radius lookup array
        accumulator_radius_lookup[ai] = radius;

        // create new blank accumulator for this radius and add to array of accumulators
        accumulators.push(createAccumulator());

        // draw circle around each edge_pixel in accumulator (Hough space) for this radius
        for (var k = 0; k < edge_pixels.length; k++) {
            drawAccumulatorCircle(ai, edge_pixels[k].xx, edge_pixels[k].yy, radius);
        }
    }

    // update radius slider
    slider_radius_widget.noUiSlider.updateOptions({
        start: accumulator_slice,
        range: {
            min: 0,
            max: accumulators.length - 1
        }
    });

    // update max radius slider
    slider_rmax_widget.noUiSlider.updateOptions({
        start: r_max,
        range: {
            min: 2,
            max: Math.max(4, ((width / 2) - 1))
        }
    });

    // Paint accumulator canvas - make function since can change which radius slice is being drawn using slider
    drawAccumulatorCanvas(accumulator_slice);

    // pass through accumulators to find maxima before drawing circles
    findAccumulatorMaxima();
}


// ## Find maximum accumulator value and corresponding radius across all radii
function findAccumulatorMaxima() {
    console.log("begin accumulator maxima");
    // the max, max radius and max index matrices look like accumulators so initialize as empty accumulators
    accumulator_max = createAccumulator(); // matrix with values = max value across all radii (single accumulator)
    accumulator_max_radius = createAccumulator(); // matrix with values = radius contributing the value in accumulator_max for that pixel 
    accumulator_max_index = createAccumulator(); // matrix with values = index of accumulators array corresponding to radius with max accumulator value for that pixel
    accumulator_max_overall = 0;

    // initialize array to track max intensity image across all accumulator radii 
    accumulator_slice_max = []

    // normalize accumulator pixels by total intensity in that accumulator
    for (var k = 0; k < accumulators.length; k++) {
        // get total intensity
        var accumulator_ink = 0;
        var slice_max = 0;
        var pixel_intensity;
        for (var r = 0; r < height + (2 * border); r++) {
            for (var c = 0; c < width + (2 * border); c++) {
                pixel_intensity = accumulators[k][r][c];
                accumulator_ink += pixel_intensity;
                if (pixel_intensity > slice_max) slice_max = pixel_intensity;
            }
        }

        accumulator_slice_max[k] = slice_max;

        // normalize
        for (var r = 0; r < height + (2 * border); r++) {
            for (var c = 0; c < width + (2 * border); c++) {
                //accumulators[k][r][c] = (accumulators[k][r][c] / accumulator_ink) * 10000;
                if (r < border || r > (height + border) || c < border || c > (width + border)) {
                    accumulators[k][r][c] += accumulators[k][r][c] / (k + 1);
                } else {
                    accumulators[k][r][c] += accumulators[k][r][c] / (3 * k + 1);
                }
            }
        }

        var accumulator_ink = 0;
        var slice_max = 0;
        var pixel_intensity;
        for (var r = 0; r < height + (2 * border); r++) {
            for (var c = 0; c < width + (2 * border); c++) {
                pixel_intensity = accumulators[k][r][c];
                accumulator_ink += pixel_intensity;
                if (pixel_intensity > slice_max) slice_max = pixel_intensity;
            }
        }

        accumulator_slice_max[k] = slice_max;
    }

    // pass through each accumulator (from smallest radius up)
    var current_pixel;
    for (var k = 0; k < accumulators.length; k++) {
        for (var r = 0; r < height + (2 * border); r++) {
            for (var c = 0; c < width + (2 * border); c++) {
                // pixel at (r,c) cooridnate in accumulator for radius represented by accumulator index k
                current_pixel = accumulators[k][r][c];

                // check overall max
                if (current_pixel > accumulator_max_overall) accumulator_max_overall = current_pixel;

                // check accumulator max matrices and update 
                if (current_pixel > accumulator_max[r][c]) {
                    accumulator_max[r][c] = current_pixel;
                    accumulator_max_radius[r][c] = accumulator_radius_lookup[k];
                    accumulator_max_index[r][c] = k;
                }
            }
        }
    }

    // update accumulator cutoff slider
    slider_cutoff_widget.noUiSlider.updateOptions({
        start: accumulator_cutoff,
        range: {
            min: 0,
            max: accumulator_max_overall - 1
        }
    });

    // draw accumulator maxima on max_canvas
    ctx = max_canvas.getContext("2d");
    max_canvas.width = width + (2 * border);
    max_canvas.height = height + (2 * border);
    var imageData = ctx.getImageData(0, 0, max_canvas.width, max_canvas.height);
    var data = imageData.data;


    // convert 2d matrix back to imageData object
    // first flatten 2d matrix
    var matflat = toFlatArr(accumulator_max);
    // now replace image data object with image matrix values
    var c = 0;
    for (var i = 0; i < data.length; i += 4) {
        data[i] = (matflat[c] / accumulator_max_overall) * 255;
        data[i + 1] = 255 - (matflat[c] / accumulator_max_overall) * 255;
        data[i + 2] = 100;
        data[i + 3] = (matflat[c] / accumulator_max_overall) * 1500;
        c++;
    }

    // write to canvas
    ctx.putImageData(imageData, 0, 0);


    // move onto next step: 
    // extract circles from accumulator by applying threshold and iterative deletion process
    findCirclesAboveThreshold();
}


// ## Find coordinates and radii and of points in accumulator above threshold
// Check for deletions - sort circle candidates on descending accumulator votes
// if less voted circle is within more voted circle, delete it 
// also check distance of 2 slices change above and below max intensity radius
// sum of these is less than -1.1 for valid circles based on inspection
function findCirclesAboveThreshold() {
    console.log("begin finding circles");
    // initialize array of circles above threshold which will then be filtered
    // to remove overlapping circles to end up with final circle_points array
    circle_point_candidates = [];
    circle_points = [];
    //
    // candidate's attributes
    var c_x, c_y, c_r, c_i, c_idx; //x_coord, y_coord, radius, intensity, index


    // pass through all pixels of max accumulator values and get those above threshold
    for (var r = 0; r < height + (2 * border); r++) {
        for (var c = 0; c < width + (2 * border); c++) {
            if (accumulator_max[r][c] > accumulator_cutoff) {
                circle_point_candidates.push({
                    match_x: r,
                    match_y: c,
                    match_r: accumulator_max_radius[r][c],
                    accumulator_index: accumulator_max_index[r][c],
                    accumulator_value: accumulators[accumulator_max_index[r][c]][r][c],
                    delete_this_circle: false // initialize to false - set to true if falls inside higher intensity circle in iterative deletion step below
                })
            }
        }
    }

    if (circle_point_candidates.length > 0) {
        // step-wise circle removal
        // sort circles on descending accumulator intensity
        // then delete circles inside square bounding already-drawn circles
        circle_point_candidates.sort(function(a, b) {
            return b.accumulator_value - a.accumulator_value;
        });

        // create array to store squares which bound each circle 
        // as it is added to the final circle_points array
        // if a circle_point_candidate intersects a square, it is deleted
        // for intersection with  
        var deletions = [];
        //
        // always keep first circle (highest intensity)
        delete circle_point_candidates[0].delete_this_circle;
        circle_points.push(circle_point_candidates[0]);
        //
        // add square surrounding circle with highest intensity to deletions
        // top left (tx, ty) and bottom right (bx,by) 
        c_x = circle_points[0].match_x;
        c_y = circle_points[0].match_y;
        c_r = circle_points[0].match_r;

        deletions.push({ tx: c_x - c_r, ty: c_y - c_r, bx: c_x + c_r, by: c_y + c_r });

        // iterate through remaining circles and only keep in final circle_points array those not deleted
        // delete a circle if another circle with a higher accumulator intensity is inside of it 
        for (var k = 1; k < circle_point_candidates.length; k++) {
            // if not already marked to delete
            if (!circle_point_candidates[k].delete_this_circle) {
                //console.log('screen candidate ' + k + " / " + circle_point_candidates.length);
                // get this candidate circle's attributes
                c_x = circle_point_candidates[k].match_x;
                c_y = circle_point_candidates[k].match_y;
                c_r = circle_point_candidates[k].match_r;
                //
                // add radius to center to get top left (c_tx, c_ty) and bottom right (c_bx, c_by) points 
                // on square bounding this candidate circle
                c_tx = c_x - c_r;
                c_ty = c_y - c_r;
                c_bx = c_x + c_r;
                c_by = c_y + c_r;

                // check if should delete circle - need to fix deletion count since can add to it and get stuck in infinite loop
                var valid_circle = true;
                for (var d = 0; d < deletions.length; d++) {
                    // deletion candidate coordinates
                    var d_tx = deletions[d].tx;
                    var d_ty = deletions[d].ty;
                    var d_bx = deletions[d].bx;
                    var d_by = deletions[d].by;


                    if (c_x >= d_tx && c_x <= d_bx && c_y >= d_ty && c_y <= d_by) {
                        // candidate circle is inside deletion
                        valid_circle = false;
                        break;
                    } else if (c_tx <= d_tx && d_tx <= c_bx && c_ty <= d_ty && d_ty <= c_by && c_ty <= d_bx && d_bx <= c_bx && c_ty <= d_by && d_by <= c_by) {
                        // candidate circle contains a deletion
                        valid_circle = false;
                        break;
                    }
                }

                // check  2 level change
                // initialize to -0.5 to account for boundary cases (where 2 levels up or down is off accumulator slices)
                var u2 = -0.5;
                var d2 = -0.5;
                var iplus = 99;
                var iminus = 99;
                var ai = circle_point_candidates[k].accumulator_index;
                var c_intensity = circle_point_candidates[k].accumulator_value;
                // check not on boundary
                if (ai + 2 < accumulators.length) {
                    iplus = accumulators[ai + 2][c_x][c_y];
                    u2 = accumulators[ai + 2][c_x][c_y] / c_intensity - 1;
                }
                if (ai - 2 >= 0) {
                    iminus = accumulators[ai - 2][c_x][c_y];
                    d2 = accumulators[ai - 2][c_x][c_y] / c_intensity - 1;
                }
                u2 = -u2;
                d2 = -d2;
                circle_point_candidates[k].check = u2 + d2;
                circle_point_candidates[k].u2 = u2;
                circle_point_candidates[k].d2 = d2;
                circle_point_candidates[k].iplus = iplus;
                circle_point_candidates[k].iminus = iminus;
                // if not enough difference, likely this circle is actually noise
                if (u2 + d2 < 2) {
                    circle_point_candidates[k].delete_this_circle = true;
                    valid_circle = false;
                }

                //  console.log(valid_circle + " check " + (u2 + d2) + "(" + c_x + "," + c_y + ") ind " + ai + " rad " + c_r);



                // only keep valid circles 
                if (valid_circle) {
                    // add this circle's bounding square to deletions
                    deletions.push({ tx: c_tx, ty: c_ty, bx: c_bx, by: c_by });
                } else {
                    circle_point_candidates[k].delete_this_circle = true;
                }
            }
        }

        // keep valid circles
        for (var k = 1; k < circle_point_candidates.length; k++) {
            if (circle_point_candidates[k].delete_this_circle == false) {
                // delete temp attributes
                delete circle_point_candidates[k].delete_this_circle;
                delete circle_point_candidates[k].u2;
                delete circle_point_candidates[k].d2;
                delete circle_point_candidates[k].iplus;
                delete circle_point_candidates[k].iminus;
                delete circle_point_candidates[k].check;

                // add to final circle points collection
                circle_points.push(circle_point_candidates[k]);
            }
        }
    }


    console.log(circle_points);
    console.log("Points remaining after iterative deletion: " + Math.round(100 * (circle_points.length / circle_point_candidates.length)));

    // // delete points created by noise of large overlapping points
    // // check intensity at level above and below selected radius for given point is similar to max radius,
    // // else false-positive caused by overlapping circle noise so delete
    // circle_point_candidates = circle_points;
    // circle_points = [];
    // for (var k = 0; k < circle_point_candidates.length; k++) {
    //     // get this candidate circle's attributes
    //     c_x = circle_point_candidates[k].match_x;
    //     c_y = circle_point_candidates[k].match_y;
    //     c_r = circle_point_candidates[k].match_r;
    //     c_i = circle_point_candidates[k].accumulator_value;
    //     c_idx = circle_point_candidates[k].accumulator_index;

    //     // check this layer intensity within 20% of previous and following accumulator layer's intensity
    //     try {
    //         var previous_layer_intensity = accumulators[c_idx - 1][c_x][c_y];
    //         var next_layer_intensity = accumulators[c_idx + 1][c_x][c_y];


    //         if (Math.abs(c_i / previous_layer_intensity - 1) >= 0.2 && Math.abs(c_i / next_layer_intensity - 1) >= 0.2) {
    //             circle_points.push(circle_point_candidates[k]);
    //         }
    //     } catch (e) {
    //         // circle on accumulators set boundary - don't reject
    //         circle_points.push(circle_point_candidates[k]);
    //     }
    // }

    // end computation timer
    var time_end = new Date().getTime();
    time_taken = time_end - time_start;
    status_default = "Done processing - time taken =   " + (time_taken / 1000).toFixed(2) + " seconds :)"
        // paint found circles on initial image
    paintCircles();
}

// ## Draw each circle match on original image
function paintCircles() {
    console.log("begin painting circles");
    // set canvas context back to orignial image
    var str = "";
    ctx = img_canvas.getContext("2d");
    for (var k = 0; k < circle_points.length; k++) {
        // paint 2px for visibility
        paintCircle(circle_points[k].match_x, circle_points[k].match_y, circle_points[k].match_r + 2, "yellow");
        paintCircle(circle_points[k].match_x + 1, circle_points[k].match_y + 1, circle_points[k].match_r + 2, "yellow");
        paintCircle(circle_points[k].match_x - 1, circle_points[k].match_y -1, circle_points[k].match_r + 2, "red");

        // construct 'circles found' output string
        str = str + "Circle " + (k + 1) + " located at (" + circle_points[k].match_x + "," + circle_points[k].match_y + ") with radius " + circle_points[k].match_r;
        str = str + "</br>";
    }

    // write output string to page
    document.getElementById("found_circles").innerHTML = str;

    document.getElementById("found").innerHTML = circle_points.length + " CIRCLES FOUND!";

    status_element.innerHTML = status_default;
    console.log(status_default);
}


// ## Create new blank accumulator
// (2D matrix with 0s sized to image + borders dimensions)
function createAccumulator() {
    //  Create blank accumulator array (filled with 0s) sized with dimensions of image + border 
    var acc = [];
    for (var r = 0; r < height + (2 * border); r++) {
        acc[r] = [];
        for (var c = 0; c < width + (2 * border); c++) {
            // fill accumulator with 0s
            acc[r][c] = 0;
        }
    }
    return acc;
}




// ## Draw circle inside accumulator using midpoint algorithm
// References:
// 1. http://en.wikipedia.org/wiki/Midpoint_circle_algorithm
// 2. http://codepen.io/sdvg/pen/oFACy
function drawAccumulatorCircle(accumulator_index, x_coord, y_coord, radius) {
    var x = radius;
    var y = 0;
    var radiusErr = 1 - x;

    var acs, ac1, ac2;
    while (x >= y) {
        //  create array to store discretized coordinates
        //  done for performance reasons - saves a LOT of array lookups when evaluating 
        //  whether accumulator pixel being incremented is within the image + border bounds
        //  initially I tried just doing a try,catch but checking the pixels being written is much faster
        acs = [];
        //
        acs.push({ ac1: x + x_coord, ac2: y + y_coord });
        acs.push({ ac1: y + x_coord, ac2: x + y_coord });
        acs.push({ ac1: -x + x_coord, ac2: y + y_coord });
        acs.push({ ac1: -y + x_coord, ac2: x + y_coord });
        acs.push({ ac1: -x + x_coord, ac2: -y + y_coord });
        acs.push({ ac1: -y + x_coord, ac2: -x + y_coord });
        acs.push({ ac1: x + x_coord, ac2: -y + y_coord });
        acs.push({ ac1: y + x_coord, ac2: -x + y_coord });

        // for each point on discretized circle
        for (var a = 0; a < acs.length; a++) {
            // increment accumulator values by 1 
            // on circle with radius centered on x_coord, y_coord
            ac1 = acs[a].ac1;
            ac2 = acs[a].ac2;
            // NB need to check drawing onto canvas (image + border canvas)
            if (ac1 >= 0 && ac2 >= 0 && ac1 < bheight && ac2 < bwidth) accumulators[accumulator_index][ac1][ac2] += 1
        }
        // move up circle pass
        y++;

        // off-arc adjustment
        if (radiusErr < 0) {
            radiusErr += 2 * y + 1;
        } else {
            x--;
            radiusErr += 2 * (y - x + 1);
        }
    }
}


// ## Draw accumulator to canvas
// accumulator_index is selects given radius-derived accumulator from accumulators array
function drawAccumulatorCanvas(accumulator_index) {
    // set context so image data can be updated with accumulator matrix at given index
    // (display given radius slice of 3d accumulator)
    ctx = accumulator_canvas.getContext("2d");
    accumulator_canvas.width = width + (2 * border);
    accumulator_canvas.height = height + (2 * border);
    var imageData = ctx.getImageData(0, 0, accumulator_canvas.width, accumulator_canvas.height);
    var data = imageData.data;


    // convert 2d matrix back to imageData object
    // first flatten 2d matrix
    var matflat = toFlatArr(accumulators[accumulator_index]);
    // now replace image data object with image matrix values
    var c = 0;
    for (var i = 0; i < data.length; i += 4) {
        data[i] = 0
        data[i + 1] = 255
        data[i + 2] = 100;
        data[i + 3] = matflat[c] * 10;
        c++;
    }

    // write to canvas
    ctx.putImageData(imageData, 0, 0);
}



// ## SLIDERS
function createSliders() {
    createThresholdSlider();
    createRadiusMaxSlider();
    createRadiusSlider();
    createCutoffSlider();
}

// ## BINARY THRESHOLD SLIDER
// controls threshold for binarization
function createThresholdSlider() {
    // create slider
    slider_threshold_widget = document.getElementById('slider_threshold_widget');
    // parametrize slider
    noUiSlider.create(slider_threshold_widget, {
        start: threshold,
        range: {
            min: 0,
            max: 255
        }

    });
    // add slider label
    var threshold_slider_description = document.getElementById('slider_threshold_description');

    // # add events to slider
    // start dragging slider handle
    slider_threshold_widget.noUiSlider.on('update', function(values, handle) {
        // update dom
        threshold_slider_description.innerHTML = Math.round(values[handle]);

        threshold = values[handle];

        // update status
        status_element.innerHTML = "release slider to begin recomputing";
    });
    // release slider handle
    slider_threshold_widget.noUiSlider.on('change', function(values, handle) {
        // recompute binarization
        createCanvases();
    });
}


// ## MAX RADIUS SLIDER
// controls max radius of found circles
function createRadiusMaxSlider() {
    // create slider
    slider_rmax_widget = document.getElementById('slider_rmax_widget');
    // parametrize slider
    noUiSlider.create(slider_rmax_widget, {
        start: 80,
        range: {
            min: 2,
            max: r_max
        }

    });
    // add slider label
    var rmax_slider_description = document.getElementById('slider_rmax_description');

    // # add events to slider
    // start dragging slider handle
    slider_rmax_widget.noUiSlider.on('update', function(values, handle) {
        // update dom
        rmax_slider_description.innerHTML = Math.round(values[handle]);

        r_max = Math.max(4, values[handle]);

        // update status
        status_element.innerHTML = "release slider to begin recomputing";
    });
    // release slider handle
    slider_rmax_widget.noUiSlider.on('change', function(values, handle) {
        // recompute binarization
        createCanvases();
        r_max = Math.max(r_max, 4);
    });
}

// ## RADIUS SLIDER
// Controls the slice of accumulator (which 'radius' ) being painted on accumulator canvas
function createRadiusSlider() {
    // create slider
    slider_radius_widget = document.getElementById('slider_radius_widget');
    // parametrize slider
    noUiSlider.create(slider_radius_widget, {
        start: 10,
        range: {
            min: 5,
            max: 10 // recomputed dynamically to max during computation
        }
    });

    // # add events to slider
    // start dragging slider handle
    slider_radius_widget.noUiSlider.on('update', function(values, handle) {
        // update dom
        slider_radius_description.innerHTML = "r = " + accumulator_radius_lookup[Math.round(values[handle])];

        // update status
        status_element.innerHTML = "release slider to begin recomputing";
    });
    // release slider handle
    slider_radius_widget.noUiSlider.on('change', function(values, handle) {
        accumulator_slice = Math.min(Math.round(values[handle], accumulators.length));
        // draw specified radius level into accumulator
        drawAccumulatorCanvas(accumulator_slice);
    });
}

// ## ACCUMULATOR CUTOFF SLIDER
// Controls the accumulator value 'cutoff' that determines circles
function createCutoffSlider() {
    // create slider
    slider_cutoff_widget = document.getElementById('slider_cutoff_widget');
    // parametrize slider
    noUiSlider.create(slider_cutoff_widget, {
        start: 10,
        range: {
            min: 0,
            max: 5 // recomputed dynamically to max during computation
        }
    });

    // # add events to slider
    // start dragging slider handle
    slider_cutoff_widget.noUiSlider.on('update', function(values, handle) {
        // update dom
        slider_cutoff_description.innerHTML = Math.round(values[handle]);

        // update status
        status_element.innerHTML = "release slider to begin recomputing";
    });
    // release slider handle
    slider_cutoff_widget.noUiSlider.on('change', function(values, handle) {
        accumulator_cutoff = Math.round(values[handle]);

        // recompute binarization
        createCanvases();
    });
}
