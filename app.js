const img = document.getElementById("stimulus");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

let gazeLog = [];
let running = false;
let tracking = false; // Separate flag for whether to draw gaze dots
const GAZE_CONFIDENCE_THRESHOLD = 0.55; // Filter low confidence predictions
let lastDrawnPos = null; // Track last position for stability checks
let heatmapData = []; // Store all gaze points for heatmap
let showingHeatmap = false; // Toggle between live dot and heatmap
let latestMapped = null; // Latest mapped gaze point for render loop
let lastSampleTs = null; // Timestamp tracking for adaptive filters
let renderRaf = null; // RAF id for draw loop

// One Euro Filter for adaptive smoothing (stable when still, responsive when moving)
class LowPassFilter {
  constructor(alpha, initialValue = null) {
    this.alpha = alpha;
    this.hasLast = initialValue !== null;
    this.last = initialValue;
  }
  filter(value) {
    if (!this.hasLast) {
      this.last = value;
      this.hasLast = true;
      return value;
    }
    const filtered = this.alpha * value + (1 - this.alpha) * this.last;
    this.last = filtered;
    return filtered;
  }
  setAlpha(alpha) {
    this.alpha = alpha;
  }
}

function alphaForCutoff(cutoff, dt) {
  const tau = 1.0 / (2 * Math.PI * cutoff);
  return 1.0 / (1.0 + tau / dt);
}

class OneEuroFilter {
  constructor(freq, minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = new LowPassFilter(alphaForCutoff(minCutoff, 1.0 / freq));
    this.dx = new LowPassFilter(alphaForCutoff(dCutoff, 1.0 / freq));
    this.lastTime = null;
  }
  filter(value, timestampSec) {
    if (this.lastTime !== null && timestampSec !== null) {
      const dt = Math.max(1e-3, timestampSec - this.lastTime);
      this.freq = 1.0 / dt;
    }
    this.lastTime = timestampSec;
    const dValue = this.x.hasLast ? (value - this.x.last) * this.freq : 0.0;
    const edValue = this.dx.filter(dValue);
    const cutoff = this.minCutoff + this.beta * Math.abs(edValue);
    this.x.setAlpha(alphaForCutoff(cutoff, 1.0 / this.freq));
    return this.x.filter(value);
  }
  reset() {
    this.x = new LowPassFilter(alphaForCutoff(this.minCutoff, 1.0 / this.freq));
    this.dx = new LowPassFilter(alphaForCutoff(this.dCutoff, 1.0 / this.freq));
    this.lastTime = null;
  }
}

const gazeFilterX = new OneEuroFilter(60, 1.1, 0.01, 1.0);
const gazeFilterY = new OneEuroFilter(60, 1.1, 0.01, 1.0);

/* ------------------ helpers ------------------ */

function syncCanvasToImage() {
  const rect = img.getBoundingClientRect();
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
  console.log("Canvas synced to image:", { width: canvas.width, height: canvas.height, displayWidth: canvas.style.width, displayHeight: canvas.style.height });
}

window.addEventListener("resize", syncCanvasToImage);
img.addEventListener("load", syncCanvasToImage);

// Call it once on page load
setTimeout(syncCanvasToImage, 100);

// Handle image upload
function setupImageUpload() {
  const imageUpload = document.getElementById("imageUpload");
  if (imageUpload) {
    imageUpload.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          img.src = e.target.result;
          setStatus("Image loaded. You can now start tracking.");
          // Reset heatmap when image changes
          heatmapData = [];
          showingHeatmap = false;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

function setStatus(msg) {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = msg;
  }
}

function drawDot(x, y) {
  if (showingHeatmap) return; // Don't draw dot or clear canvas if showing heatmap
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,0,0,0.85)";
  ctx.fill();
}

function drawHeatmap() {
  console.log("drawHeatmap() called with", heatmapData.length, "points");
  
  if (heatmapData.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStatus("No gaze data yet for heatmap - look at the image first!");
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  console.log("Canvas dimensions:", { width: canvas.width, height: canvas.height });

  // Create image data for heatmap - OPTIMIZED
  const imageData = ctx.createImageData(canvas.width, canvas.height);
  const data = imageData.data;

  // Build intensity map from gaze points - use smaller radius for performance
  const intensityMap = new Uint8Array(canvas.width * canvas.height);

  // For each gaze point, add gaussian blur with SMALLER radius
  heatmapData.forEach((point, idx) => {
    if (idx % 500 === 0) console.log(`Processing point ${idx}/${heatmapData.length}`);
    
    const radius = 40; // Reduced from 60 for performance
    const maxIntensity = 100;

    // Only iterate within bounding box
    const startX = Math.max(0, Math.round(point.x - radius));
    const endX = Math.min(canvas.width, Math.round(point.x + radius));
    const startY = Math.max(0, Math.round(point.y - radius));
    const endY = Math.min(canvas.height, Math.round(point.y + radius));

    for (let py = startY; py < endY; py++) {
      for (let px = startX; px < endX; px++) {
        const dx = px - point.x;
        const dy = py - point.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < radius) {
          // Gaussian distribution
          const intensity = maxIntensity * Math.exp(-((distance * distance) / (2 * radius * radius)));
          const idx = py * canvas.width + px;
          intensityMap[idx] = Math.min(255, intensityMap[idx] + intensity);
        }
      }
    }
  });

  // Find max intensity for normalization
  let maxIntensityValue = 0;
  for (let i = 0; i < intensityMap.length; i++) {
    if (intensityMap[i] > maxIntensityValue) {
      maxIntensityValue = intensityMap[i];
    }
  }
  console.log("Max intensity value:", maxIntensityValue);

  if (maxIntensityValue === 0) maxIntensityValue = 1; // Avoid division by zero

  // Color map: blue (cold) -> cyan -> green -> yellow -> red (hot)
  for (let i = 0; i < intensityMap.length; i++) {
    const normalized = intensityMap[i] / maxIntensityValue;

    if (normalized > 0.02) {
      let r, g, b;

      if (normalized < 0.25) {
        // Blue to Cyan
        r = 0;
        g = Math.floor(normalized / 0.25 * 255);
        b = 255;
      } else if (normalized < 0.5) {
        // Cyan to Green
        r = 0;
        g = 255;
        b = Math.floor(255 * (1 - (normalized - 0.25) / 0.25));
      } else if (normalized < 0.75) {
        // Green to Yellow
        r = Math.floor((normalized - 0.5) / 0.25 * 255);
        g = 255;
        b = 0;
      } else {
        // Yellow to Red
        r = 255;
        g = Math.floor(255 * (1 - (normalized - 0.75) / 0.25));
        b = 0;
      }

      const dataIdx = i * 4;
      data[dataIdx] = r; // Red
      data[dataIdx + 1] = g; // Green
      data[dataIdx + 2] = b; // Blue
      data[dataIdx + 3] = Math.floor(normalized * 180); // Alpha
    }
  }

  ctx.putImageData(imageData, 0, 0);
  console.log("Heatmap drawn successfully!");
  setStatus(`Heatmap showing ${heatmapData.length} gaze points (Click "Show Gaze Dot" to switch back)`);
}

function screenToImageCoords(gx, gy) {
  const rect = img.getBoundingClientRect();
  const x = gx - rect.left;
  const y = gy - rect.top;
  const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
  return { x, y, inside };
}

// Global function for heatmap toggle button

/* ------------------ WebGazer ------------------ */

async function startWebgazer() {
  if (running) return;

  try {
    setStatus("Initializing WebGazer...");

    // Start WebGazer with error handling
    const result = await webgazer.begin();
    
    if (!result) {
      setStatus("Error: Failed to start WebGazer. Check camera permissions.");
      return;
    }

    // Click-based training (helps calibration)
    if (webgazer.addMouseEventListeners) webgazer.addMouseEventListeners();

    // Clean UI (optional)
    if (webgazer.showPredictionPoints) webgazer.showPredictionPoints(false);
    if (webgazer.showFaceOverlay) webgazer.showFaceOverlay(false);
    if (webgazer.showFaceFeedbackBox) webgazer.showFaceFeedbackBox(false);

    running = true;
    setStatus("WebGazer initialized. Ready for calibration.");
  } catch (error) {
    console.error("WebGazer error:", error);
    setStatus(`Error: ${error.message || "Failed to start WebGazer"}`);
    running = false;
  }
}

function stopWebgazer() {
  running = false;
  tracking = false;
  lastDrawnPos = null; // Reset position tracking
  latestMapped = null;
  lastSampleTs = null;
  gazeFilterX.reset();
  gazeFilterY.reset();
  if (renderRaf) cancelAnimationFrame(renderRaf);
  renderRaf = null;
  if (webgazer.end) webgazer.end();
  setStatus("Stopped");
}

function startGazeTracking() {
  console.log("startGazeTracking() called, tracking before =", tracking);
  
  // Gaze listener - only set this up after calibration
  webgazer.setGazeListener((data, timestamp) => {
    if (!tracking) return; // Only draw if tracking is enabled
    if (!data) return;

    const gx = data.x;
    const gy = data.y;
    const conf = typeof data.confidence === "number" ? data.confidence : 1;
    const ts = typeof timestamp === "number" ? timestamp : performance.now();
    const tsSec = ts / 1000;

    if (conf < GAZE_CONFIDENCE_THRESHOLD) return;

    // Filter out likely bad predictions (extreme coordinates or NaN)
    if (isNaN(gx) || isNaN(gy) || gx < -100 || gx > window.innerWidth + 100 || 
        gy < -100 || gy > window.innerHeight + 100) {
      return;
    }

    // Adaptive smoothing (One Euro Filter)
    const smoothedGaze = {
      x: gazeFilterX.filter(gx, tsSec),
      y: gazeFilterY.filter(gy, tsSec)
    };

    const mapped = screenToImageCoords(smoothedGaze.x, smoothedGaze.y);
    
    // Only update if we have a valid position and it's on the image
    if (!mapped.inside) {
      lastDrawnPos = null;
      latestMapped = null;
      return;
    }

    // Stability check: clamp large jumps but allow fast saccades
    const dt = lastSampleTs ? Math.max(0.008, (ts - lastSampleTs) / 1000) : 0.016;
    lastSampleTs = ts;

    if (lastDrawnPos) {
      const dx = mapped.x - lastDrawnPos.x;
      const dy = mapped.y - lastDrawnPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const maxStep = 120 + 550 * dt; // allow bigger jumps when dt is larger

      if (distance < 1.5) {
        mapped.x = lastDrawnPos.x;
        mapped.y = lastDrawnPos.y;
      } else if (distance > maxStep) {
        const scale = maxStep / distance;
        mapped.x = lastDrawnPos.x + dx * scale;
        mapped.y = lastDrawnPos.y + dy * scale;
      }
    }

    lastDrawnPos = { x: mapped.x, y: mapped.y };
    latestMapped = { x: mapped.x, y: mapped.y };

    // Collect data for heatmap (sample every 3rd point to reduce memory usage)
    if (gazeLog.length % 3 === 0) {
      heatmapData.push({ x: mapped.x, y: mapped.y });
    }

    gazeLog.push({
      t: timestamp,
      gx: smoothedGaze.x,
      gy: smoothedGaze.y,
      ix: mapped.x,
      iy: mapped.y,
    });
  });

  tracking = true; // Enable tracking after listener is set
  if (!renderRaf) {
    const renderLoop = () => {
      if (tracking && latestMapped && !showingHeatmap) {
        drawDot(latestMapped.x, latestMapped.y);
      }
      renderRaf = requestAnimationFrame(renderLoop);
    };
    renderRaf = requestAnimationFrame(renderLoop);
  }
  console.log("Gaze tracking enabled with stability improvements");
}

/* ------------------ Calibration ------------------ */

function getImageBoxInStage() {
  const stageRect = document.getElementById("stage").getBoundingClientRect();
  const imgRect = img.getBoundingClientRect();

  // Convert imgRect (viewport coords) into overlay-local coords
  const left = imgRect.left - stageRect.left;
  const top = imgRect.top - stageRect.top;
  const width = imgRect.width;
  const height = imgRect.height;

  return { left, top, width, height };
}

async function runCalibration() {
  console.log("runCalibration() called, running =", running);
  
  // Ensure WebGazer is running before calibration
  if (!running) {
    console.log("WebGazer not running, starting it...");
    await startWebgazer();
  }

  console.log("Starting calibration loop...");
  ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear any existing dots

  // Enable pointer events on calibration overlay during calibration
  const calibOverlay = document.getElementById("calibration-overlay");
  calibOverlay.style.pointerEvents = "auto";

  setStatus("Calibration starting... Look at each dot and click when you see it");

  // Use image-relative coordinates (0-1 range)
  const points = [
    [0.1, 0.1], [0.5, 0.1], [0.9, 0.1],
    [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
    [0.1, 0.9], [0.5, 0.9], [0.9, 0.9],
    // Add more intermediate points for better accuracy
    [0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7],
  ];

  const clicksPerDot = 3; // Reduced from 5 to 3 since we have more points now

  for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
    const [px, py] = points[pointIndex];
    
    const { left, top, width, height } = getImageBoxInStage();
    
    // px, py are in 0..1 relative to the IMAGE (not the overlay)
    const x = left + px * width;
    const y = top + py * height;

    console.log(`Creating dot ${pointIndex + 1}/${points.length} at image position (${(px * 100).toFixed(1)}%, ${(py * 100).toFixed(1)}%), overlay position (${x.toFixed(0)}px, ${y.toFixed(0)}px)`);
    
    // Remove any existing dots first
    document.querySelectorAll(".calib-dot").forEach(d => d.remove());
    
    const dot = document.createElement("div");
    dot.className = "calib-dot";
    dot.style.position = "absolute";
    dot.style.left = x + "px";
    dot.style.top = y + "px";
    dot.style.zIndex = "100000";
    dot.textContent = `0/${clicksPerDot}`;
    calibOverlay.appendChild(dot);

    setStatus(`Calibration: Point ${pointIndex + 1}/${points.length} - Stare at the blue dot and click ${clicksPerDot} times`);

    await new Promise((resolve) => {
      let count = 0;
      
      const clickHandler = () => {
        count++;
        dot.textContent = `${count}/${clicksPerDot}`;
        
        // Add slight visual feedback on click
        dot.style.background = "rgba(0, 200, 0, 0.95)";
        dot.style.boxShadow = "0 0 10px rgba(0, 200, 0, 0.8)";
        setTimeout(() => {
          dot.style.background = "rgba(0, 120, 255, 0.95)";
          dot.style.boxShadow = "0 0 15px rgba(0, 120, 255, 0.8)";
        }, 150);

        if (count >= clicksPerDot) {
          dot.removeEventListener("click", clickHandler);
          dot.remove();
          resolve();
        }
      };
      
      dot.addEventListener("click", clickHandler);
    });
  }

  // Clean up any remaining dots
  document.querySelectorAll(".calib-dot").forEach(d => d.remove());
  
  // Start gaze tracking NOW, after calibration is complete
  lastDrawnPos = null;
  latestMapped = null;
  lastSampleTs = null;
  gazeFilterX.reset();
  gazeFilterY.reset();
  startGazeTracking();
  
  setStatus("Calibration complete! Now look at the image and check the accuracy. You can recalibrate if needed.");
  
  // Give time for calibration to register
  await new Promise(resolve => setTimeout(resolve, 500));
}

/* ------------------ buttons ------------------ */

console.log("app.js loaded, waiting for DOM...");

// Wait for DOM to be ready
function initButtons() {
  console.log("=== initButtons called ===");
  
  const startBtn = document.getElementById("startBtn");
  const calibrateBtn = document.getElementById("calibrateBtn");
  const heatmapBtn = document.getElementById("heatmapBtn");
  
  console.log("Button search results:", { 
    startBtn: !!startBtn, 
    calibrateBtn: !!calibrateBtn, 
    heatmapBtn: !!heatmapBtn
  });

  startBtn.addEventListener("click", () => {
    console.log("Start button clicked!");
    if (!running) startWebgazer();
    else stopWebgazer();
  });

  calibrateBtn.addEventListener("click", () => {
    console.log("Calibrate button clicked!");
    runCalibration().catch(err => console.error("Calibration error:", err));
  });

  // Heatmap button
  if (heatmapBtn) {
    console.log("Attaching heatmap button listener...");
    heatmapBtn.addEventListener("click", function() {
      console.log(">>> HEATMAP CLICKED <<<");
      showingHeatmap = !showingHeatmap;
      
      if (showingHeatmap) {
        heatmapBtn.textContent = "Show Gaze Dot";
        console.log("Drawing heatmap, data points:", heatmapData.length);
        drawHeatmap();
      } else {
        heatmapBtn.textContent = "Show Heatmap";
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setStatus("Gaze tracking active");
      }
    });
    console.log("Heatmap button listener attached!");
  } else {
    console.error("Heatmap button NOT FOUND!");
  }
  
  console.log("=== Buttons initialized ===");
}

// Try to init immediately
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initButtons();
    setupImageUpload();
  });
} else {
  initButtons();
  setupImageUpload();
}
