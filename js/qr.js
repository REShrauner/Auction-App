// ── QR generation + camera scanning ──────────────────────────

// ── Generation (uses qrcode.js CDN) ──────────────────────────

function generateQRCanvas(canvas, value, size) {
  return QRCode.toCanvas(canvas, String(value), {
    width:  size || 180,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

// ── Camera scanning ───────────────────────────────────────────
// Uses BarcodeDetector where available; falls back to a polling
// loop with the jsQR library loaded on demand.

let _activeScanners = {};   // videoElementId → { stream, raf }

async function startScanner(videoId, onDetected) {
  if (_activeScanners[videoId]) stopScanner(videoId);

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }
    });
  } catch (e) {
    alert('Camera access denied or unavailable. You can enter the number manually.');
    return false;
  }

  const video = $(videoId);
  video.srcObject = stream;
  await video.play();

  // Prefer native BarcodeDetector
  if (typeof BarcodeDetector !== 'undefined') {
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    let running = true;

    async function tick() {
      if (!running) return;
      try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          onDetected(barcodes[0].rawValue);
          return;
        }
      } catch (_) {}
      requestAnimationFrame(tick);
    }

    _activeScanners[videoId] = {
      stream,
      stop: () => { running = false; }
    };
    requestAnimationFrame(tick);

  } else {
    // Fallback: load jsQR dynamically then poll via canvas
    if (!window.jsQR) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    let running  = true;

    function tick() {
      if (!running || video.readyState < video.HAVE_ENOUGH_DATA) {
        if (running) requestAnimationFrame(tick);
        return;
      }
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });
      if (code) {
        onDetected(code.data);
        return;
      }
      requestAnimationFrame(tick);
    }

    _activeScanners[videoId] = {
      stream,
      stop: () => { running = false; }
    };
    requestAnimationFrame(tick);
  }

  return true;
}

function stopScanner(videoId) {
  const entry = _activeScanners[videoId];
  if (!entry) return;
  entry.stop();
  entry.stream.getTracks().forEach(t => t.stop());
  const video = $(videoId);
  if (video) { video.srcObject = null; }
  delete _activeScanners[videoId];
}

function stopAllScanners() {
  Object.keys(_activeScanners).forEach(stopScanner);
}
