const W = 16, H = 32, upscale = 8;
let USE_UPSCALE_BLUR = true;

let wax = Array.from({ length: H }, () => Array(W).fill(0));
let heat = Array.from({ length: H }, () => Array(W).fill(0));
let frame = 0;

let HOT_COLOR = [224, 71, 0];    // default: #e04700ff
let COLD_COLOR = [180, 50, 0];  // default: #b43200ff

const simFPS = 10; //not used yet but thinking about doing movement smoothing
const renderFPS = 60;

// Helper: hex -> RGB array
function hexToRGB(hex) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
}

// Fill bottom with wax and initial heat
for (let y = H - 5; y < H; y++)
    for (let x = 0; x < W; x++) {
        if (Math.random() < 0.9) wax[y][x] = 1;
        heat[y][x] = 0.5;
    }

function linspace(a, b, n) {
    return Array.from({ length: n }, (_, i) => a + (b - a) * (i / (n - 1)));
}

function updateHeat() {
    // Increment frame counter and wrap to prevent large numbers
    frame = (frame + 1) % 10000;

    //--------------------------------------
    // Cool the top: always steady
    //--------------------------------------
    let cool = linspace(1, 0.2, 10);
    for (let y = 0; y < 10; y++)
        for (let x = 0; x < W; x++)
            heat[y][x] -= 0.001 * cool[y];

    //--------------------------------------
    // Animate the hot zone with a vertical oscillation
    //--------------------------------------
    let offset = Math.floor(Math.sin(frame * 0.02) * 5); // oscillates up/down by ±5 rows
    let hotHeight = 15;
    let hot = linspace(0.2, 1, hotHeight);
    for (let y = H - hotHeight + offset; y < H + offset; y++) {
        if (y < 0 || y >= H) continue; // stay in bounds
        for (let x = 0; x < W; x++)
            heat[y][x] += 0.001 * hot[Math.max(0, Math.min(hotHeight - 1, y - (H - hotHeight + offset)))];
    }

    //--------------------------------------
    // Local center heat boost (Gaussian profile in X)
    //--------------------------------------
    let xline = linspace(-1, 1, W);
    let profile = xline.map(v => Math.exp(-4 * v * v));
    for (let y = H - 5; y < H; y++)
        for (let x = 0; x < W; x++)
            heat[y][x] += 0.001 * profile[x];

    //--------------------------------------
    // Mild diffusion between neighboring wax pixels
    //--------------------------------------
    let newHeat = heat.map(r => r.slice());
    for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
            if (wax[y][x] === 1) {
                let sum = heat[y][x] * 4, count = 4;
                for (let [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                    let ny = y + dy, nx = x + dx;
                    if (wax[ny][nx] === 1) { sum += heat[ny][nx]; count++; }
                }
                newHeat[y][x] = 0.95 * heat[y][x] + 0.05 * (sum / count);
            }
        }
    heat = newHeat;

    //--------------------------------------
    // Mild uniform heat loss + tiny random perturbation + clamp
    //--------------------------------------
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            heat[y][x] -= 0.0001;
            heat[y][x] += (Math.random() - 0.5) * 0.0002;
            heat[y][x] = Math.max(0, Math.min(1, heat[y][x]));
        }
}


function countNeighbors(y, x, t) {
    let count = 0;
    for (let dy of [-1, 0, 1])
        for (let dx of [-1, 0, 1]) {
            if (dy === 0 && dx === 0) continue;
            let ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < H && nx >= 0 && nx < W)
                if (wax[ny][nx] === 1 && Math.abs(heat[ny][nx] - t) < 0.8) count++;
        }
    return count;
}

function updateWax() {
    let indices = [];
    // Build a shuffled list of all wax pixels to process in random order
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
            if (wax[y][x] === 1) indices.push([y, x]);
    shuffle(indices);

    // Prepare new arrays to build the next state of the wax + heat
    let newWax = Array.from({ length: H }, () => Array(W).fill(0));
    let newHeat = Array.from({ length: H }, () => Array(W).fill(0));

    for (let [y, x] of indices) {
        let t = heat[y][x], dy = 0;

        // Determine vertical tendency based on temperature
        // hotter wax rises, colder wax sinks
        if (t > 0.7) dy = -1;
        else if (t < 0.3) dy = 1;
        else if (t > 0.8 && Math.random() < 0.5) dy = -1;

        // ----------------------------------------------------
        // Handling isolated pixels (small clusters) to prevent stuck artifacts
        // cold strays can randomly sink down
        let cluster = countNeighbors(y, x, t);
        if (cluster < 2 && t < 0.5 && Math.random() < 0.3) {
            let ny = y + 1;
            if (ny >= 0 && ny < H && x >= 0 && x < W) {
                if (wax[ny][x] === 0 && newWax[ny][x] === 0) {
                    newWax[ny][x] = 1;
                    newHeat[ny][x] = t;
                    continue; // done with this pixel
                }
            }
        }

        // hot strays can randomly rise up
        if (cluster < 2 && t > 0.5 && Math.random() < 0.3) {
            let ny = y - 1;
            if (ny >= 0 && ny < H && x >= 0 && x < W) {
                if (wax[ny][x] === 0 && newWax[ny][x] === 0) {
                    newWax[ny][x] = 1;
                    newHeat[ny][x] = t;
                    continue;
                }
            }
        }

        // ----------------------------------------------------
        // Normal wax movement: try to move in preferred vertical direction
        let moves = [];
        if (dy !== 0) {
            let ny = y + dy;
            if (ny > 0 && ny < H - 1) {
                // try to move straight up or down
                if (wax[ny][x] === 0 && newWax[ny][x] === 0) moves.push([ny, x]);
                // try to move diagonally
                for (let dx of shuffle([-1, 1])) {
                    let nx = x + dx;
                    if (nx > 0 && nx < W - 1 && wax[ny][nx] === 0 && newWax[ny][nx] === 0) moves.push([ny, nx]);
                }
            }
        } else {
            // no vertical movement, stay in place
            moves.push([y, x]);
        }

        // ----------------------------------------------------
        // Choose the move that keeps wax most clustered (surface tension effect)
        let best = [y, x], bestScore = -1;
        for (let [my, mx] of moves) {
            let score = countNeighbors(my, mx, t);
            if (score > bestScore) { bestScore = score; best = [my, mx]; }
        }

        // If still very isolated, just stay in place
        if (bestScore < 3) best = [y, x];

        // Place wax and carry over temperature
        newWax[best[0]][best[1]] = 1;
        newHeat[best[0]][best[1]] = t;
    }

    // Update global wax and heat arrays
    wax = newWax;
    heat = newHeat;
}


function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');


function drawPixelRender() {
    let off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    let offCtx = off.getContext('2d');

    let img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            let idx = (y * W + x) * 4;
            if (wax[y][x] === 1) {
                // wax pixels: hot = red, cold = blue
                img.data[idx] = heat[y][x] * 255;
                img.data[idx + 2] = (1 - heat[y][x]) * 255;
                img.data[idx + 3] = 255;
            }
        }
    offCtx.putImageData(img, 0, 0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
}

function drawSmoothRender() {

    //------------------------------------
    // HOT pass
    //------------------------------------
    const largeHot = document.createElement('canvas');
    largeHot.width = W * upscale;
    largeHot.height = H * upscale;
    const largeHotCtx = largeHot.getContext('2d');

    largeHotCtx.clearRect(0, 0, largeHot.width, largeHot.height);
    largeHotCtx.imageSmoothingEnabled = true;

    const texSize = 64; // assume your blurTex.png is 32×32
    const texHalf = texSize / 2;

    const gradientImg = document.getElementById('blur-texture'); // must exist in DOM

    // Stamp blur texture at each hot wax pixel
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (wax[y][x] === 1 && heat[y][x] > 0.51) {
                const px = x * upscale;
                const py = y * upscale;

                /*
                // Optional: use heat to modulate opacity
                const strength = (heat[y][x] - 0.5) * 2; // normalize to [0,1]
                const alpha = Math.max(0, Math.min(1, strength)); */

                largeHotCtx.save();
                //largeHotCtx.globalAlpha = alpha;
                largeHotCtx.drawImage(
                    gradientImg,
                    px - texHalf,
                    py - texHalf,
                    texSize,
                    texSize
                );
                largeHotCtx.restore();
            }
        }
    }

    //Threshold
    const imgHot = largeHotCtx.getImageData(0, 0, largeHot.width, largeHot.height);
    const data = imgHot.data;

    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3]; // alpha channel
        const g = data[i + 1] / 255;       // green channel = Y up vector component (0 to 1)

        if (alpha > 200) {
            const strength = alpha / 255;

            // Fake top-down shadow: stronger when "facing down" (i.e. G is low)
            const shadow = 2.0 - g; // G=1 → top → shadow=0, G=0 → bottom → shadow=1

            // Vertical global overlay: 0 at top, 1 at bottom
            const y = Math.floor(i / 4 / largeHot.width);
            const vertical = y / largeHot.height;

            // You can curve this if needed:
            const vShadow = 0.2 + 0.8 * Math.pow(vertical, 1.0);

            const lit = strength * shadow * vShadow;

            data[i] = HOT_COLOR[0] * lit;
            data[i + 1] = HOT_COLOR[1] * lit;
            data[i + 2] = HOT_COLOR[2] * lit;
            data[i + 3] = 255; // fully visible
        } else {
            data[i + 3] = 0; // fully transparent
        }
    }
    largeHotCtx.putImageData(imgHot, 0, 0);

    //------------------------------------
    // COLD pass (same multi-stage blur + dimming)
    //------------------------------------
    const largeCold = document.createElement('canvas');
    largeCold.width = W * upscale;
    largeCold.height = H * upscale;
    const largeColdCtx = largeCold.getContext('2d');

    largeColdCtx.clearRect(0, 0, largeCold.width, largeCold.height);
    largeColdCtx.imageSmoothingEnabled = true;

    // Stamp blur texture at each cold wax pixel
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (wax[y][x] === 1 && heat[y][x] <= 0.49) {
                const px = x * upscale;
                const py = y * upscale;

                largeColdCtx.save();
                largeColdCtx.drawImage(
                    gradientImg,
                    px - texHalf,
                    py - texHalf,
                    texSize,
                    texSize
                );
                largeColdCtx.restore();
            }
        }
    }

    // Threshold on alpha to get final solid blobs
    const imgCold = largeColdCtx.getImageData(0, 0, largeCold.width, largeCold.height);
    const dataCold = imgCold.data;

    for (let i = 0; i < dataCold.length; i += 4) {
        const alpha = dataCold[i + 3]; // alpha channel
        const g = dataCold[i + 1] / 255;       // green channel = Y up vector component (0 to 1)

        if (alpha > 200) {
            const strength = alpha / 255;

            // Fake top-down shadow: stronger when "facing down" (i.e. G is low)
            const shadow = 2.0 - g; // G=1 → top → shadow=0, G=0 → bottom → shadow=1

            // Vertical global overlay: 0 at top, 1 at bottom
            const y = Math.floor(i / 4 / largeCold.width);
            const vertical = y / largeCold.height;

            // You can curve this if needed:
            const vShadow = 0.2 + 0.8 * Math.pow(vertical, 1.0);

            const lit = strength * shadow * vShadow;

            dataCold[i] = COLD_COLOR[0] * lit;
            dataCold[i + 1] = COLD_COLOR[1] * lit;
            dataCold[i + 2] = COLD_COLOR[2] * lit;
            dataCold[i + 3] = 255; // fully visible
        } else {
            dataCold[i + 3] = 0; // fully transparent
        }
    }
    largeColdCtx.putImageData(imgCold, 0, 0);


    //------------------------------------
    // Composite final image
    //------------------------------------

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(largeHot, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(largeCold, 0, 0, canvas.width, canvas.height);
}

document.getElementById('toggleMode').onclick = () => {
    USE_UPSCALE_BLUR = !USE_UPSCALE_BLUR;
};

function loop() {
    updateHeat();
    updateWax();

    if (USE_UPSCALE_BLUR)
        drawSmoothRender();
    else drawPixelRender();
    
    setTimeout(loop, 30);
}

loop();

window.addEventListener('DOMContentLoaded', () => {
    const hotPicker = document.getElementById('hotColor');
    const coldPicker = document.getElementById('coldColor');

    hotPicker.addEventListener('input', () => {
        HOT_COLOR = hexToRGB(hotPicker.value);
    });

    coldPicker.addEventListener('input', () => {
        COLD_COLOR = hexToRGB(coldPicker.value);
    });
});
