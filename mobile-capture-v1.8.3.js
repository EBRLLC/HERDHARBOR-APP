(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborMobileCapture = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "1.8.3";
  const BUILD = "offline-mobile-capture-1";
  const DEFAULT_MAX_EDGE = 2048;
  const DEFAULT_MAX_BYTES = 3_500_000;
  const DEFAULT_QUALITY = 0.82;

  function dataUrlBytes(dataUrl = "") {
    const comma = String(dataUrl).indexOf(",");
    if (comma < 0) return 0;
    const base64 = String(dataUrl).slice(comma + 1);
    return Math.floor(base64.length * 3 / 4);
  }

  function readBlobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const Reader = root.FileReader;
      if (typeof Reader !== "function") return reject(new Error("This browser cannot read image files."));
      const reader = new Reader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("The image could not be read."));
      reader.readAsDataURL(blob);
    });
  }

  async function decodeImage(file) {
    if (typeof root.createImageBitmap === "function") {
      try {
        return await root.createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {
        try { return await root.createImageBitmap(file); } catch {}
      }
    }
    const ImageCtor = root.Image;
    const URLApi = root.URL;
    if (typeof ImageCtor !== "function" || !URLApi?.createObjectURL) {
      throw new Error("This browser cannot prepare the image for mobile upload.");
    }
    const url = URLApi.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const image = new ImageCtor();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("The image could not be decoded."));
        image.src = url;
      });
    } finally {
      URLApi.revokeObjectURL(url);
    }
  }

  function dimensions(image) {
    const width = Number(image?.width || image?.naturalWidth || 0);
    const height = Number(image?.height || image?.naturalHeight || 0);
    return { width, height };
  }

  function scaledDimensions(width, height, maxEdge = DEFAULT_MAX_EDGE) {
    if (!width || !height) return { width: 0, height: 0, scale: 1 };
    const longest = Math.max(width, height);
    if (longest <= maxEdge) return { width, height, scale: 1 };
    const scale = maxEdge / longest;
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      scale
    };
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      if (typeof canvas?.toBlob !== "function") return reject(new Error("This browser cannot compress the image."));
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image compression failed.")), type, quality);
    });
  }

  async function prepareImage(file, options = {}) {
    if (!file) throw new Error("Choose a photo first.");
    if (!["image/jpeg", "image/png"].includes(String(file.type || "").toLowerCase())) {
      throw new Error("Photo-assisted entry currently supports JPG and PNG images.");
    }

    const maxEdge = Math.max(1024, Number(options.maxEdge || DEFAULT_MAX_EDGE));
    const maxBytes = Math.max(500_000, Number(options.maxBytes || DEFAULT_MAX_BYTES));
    const image = await decodeImage(file);
    const source = dimensions(image);
    if (!source.width || !source.height) {
      try { image?.close?.(); } catch {}
      throw new Error("The image dimensions could not be read.");
    }

    let target = scaledDimensions(source.width, source.height, maxEdge);
    const documentRef = root.document;
    const canvas = documentRef?.createElement?.("canvas");
    if (!canvas) {
      try { image?.close?.(); } catch {}
      const dataUrl = await readBlobAsDataUrl(file);
      if (dataUrlBytes(dataUrl) > maxBytes) throw new Error("That image is too large for this browser to prepare safely.");
      return {
        dataUrl,
        mimeType: String(file.type || "image/jpeg").toLowerCase(),
        fileName: String(file.name || "record-photo"),
        sourceWidth: source.width,
        sourceHeight: source.height,
        width: source.width,
        height: source.height,
        compressed: false,
        orientationNormalized: false
      };
    }

    const context = canvas.getContext?.("2d", { alpha: false });
    if (!context) {
      try { image?.close?.(); } catch {}
      throw new Error("This browser cannot prepare the image canvas.");
    }

    const attempts = [
      { quality: Number(options.quality || DEFAULT_QUALITY), scale: 1 },
      { quality: 0.72, scale: 0.9 },
      { quality: 0.62, scale: 0.8 },
      { quality: 0.54, scale: 0.7 }
    ];

    let output = null;
    for (const attempt of attempts) {
      const width = Math.max(1, Math.round(target.width * attempt.scale));
      const height = Math.max(1, Math.round(target.height * attempt.scale));
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const blob = await canvasBlob(canvas, "image/jpeg", attempt.quality);
      if (!output || blob.size < output.blob.size) output = { blob, width, height };
      if (blob.size <= maxBytes) break;
    }

    try { image?.close?.(); } catch {}
    if (!output || output.blob.size > maxBytes) {
      throw new Error("That image is still too large after compression. Move closer to the document and retake the photo.");
    }

    const dataUrl = await readBlobAsDataUrl(output.blob);
    return {
      dataUrl,
      mimeType: "image/jpeg",
      fileName: String(file.name || "record-photo").replace(/\.(png|jpe?g)$/i, "") + ".jpg",
      sourceWidth: source.width,
      sourceHeight: source.height,
      width: output.width,
      height: output.height,
      compressed: output.blob.size < Number(file.size || Infinity) || output.width !== source.width || output.height !== source.height,
      orientationNormalized: true
    };
  }

  function createRetryController(options = {}) {
    if (typeof options.execute !== "function") throw new Error("Mobile capture retry controller requires execute().");
    const isOnline = typeof options.isOnline === "function"
      ? options.isOnline
      : () => root.navigator?.onLine !== false;
    const onStatus = typeof options.onStatus === "function" ? options.onStatus : () => {};
    let pending = null;
    let inFlight = null;
    let lastReason = "";

    function status(state, message = "") {
      onStatus({ state, message, pending: Boolean(pending), inFlight: Boolean(inFlight), reason: lastReason });
    }

    async function executePending() {
      if (!pending || inFlight) return inFlight || false;
      if (!isOnline()) {
        status("offline", "Photo is ready on this screen and will retry when connection returns.");
        return { queued: true };
      }
      const payload = pending;
      inFlight = (async () => {
        status("working", "Analyzing photo…");
        try {
          const result = await options.execute(payload);
          pending = null;
          lastReason = "";
          status("complete", "Photo draft ready for review.");
          return result;
        } catch (error) {
          const retryable = error?.retryable === true || ["provider_timeout","provider_rate_limit","provider_error","secure_service_error"].includes(String(error?.code || ""));
          if (!retryable) pending = null;
          lastReason = String(error?.code || (retryable ? "retryable_error" : "error"));
          status(retryable ? "pending" : "error", retryable
            ? "Photo analysis is pending and can retry without creating a record."
            : (error?.message || "Photo analysis failed."));
          throw error;
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    }

    async function run(payload) {
      pending = payload;
      lastReason = "";
      return executePending();
    }

    async function resume(reason = "resume") {
      if (inFlight) return inFlight;
      if (!pending || !isOnline()) return false;
      lastReason = reason;
      return executePending();
    }

    function clear() {
      pending = null;
      lastReason = "";
      status("idle", "");
    }

    function getState() {
      return { pending: Boolean(pending), inFlight: Boolean(inFlight), reason: lastReason };
    }

    return Object.freeze({ run, resume, clear, getState });
  }

  return Object.freeze({
    VERSION,
    BUILD,
    DEFAULT_MAX_EDGE,
    DEFAULT_MAX_BYTES,
    dataUrlBytes,
    scaledDimensions,
    prepareImage,
    createRetryController
  });
});
