import { useEffect, useRef, useState } from "react";

// We load face-api.js models from /models directory
// Models must be placed in public/models/

let faceapi = null;
let modelsLoaded = false;

// Use CDN - no need to download model files manually
const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

async function loadFaceApi() {
  if (typeof window === "undefined") return null;
  if (faceapi) return faceapi;

  faceapi = await import("face-api.js");

  if (!modelsLoaded) {
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    modelsLoaded = true;
  }

  return faceapi;
}

/**
 * useFaceDetection
 * Attaches to a <video> ref and runs face detection every interval ms.
 * Returns: { faceCount, faceScore, captureSnapshot }
 */
export function useFaceDetection(videoRef, canvasRef, active = true) {
  const [faceCount, setFaceCount] = useState(0);
  const [faceScore, setFaceScore] = useState(0);
  const [modelsLoading, setModelsLoading] = useState(true);
  const intervalRef = useRef(null);
  const apiRef = useRef(null);

  useEffect(() => {
    if (!active) return;

    let running = true;

    async function init() {
      setModelsLoading(true);
      apiRef.current = await loadFaceApi();
      setModelsLoading(false);
      if (!running || !apiRef.current) return;

      intervalRef.current = setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;

        const detections = await apiRef.current
          .detectAllFaces(video, new apiRef.current.TinyFaceDetectorOptions())
          .run();

        if (!running) return;

        setFaceCount(detections.length);

        if (detections.length === 1) {
          // Score = confidence * 100 (face-api returns score 0-1)
          const score = Math.round(detections[0].score * 100);
          setFaceScore(score);

          // Draw on canvas
          const canvas = canvasRef?.current;
          if (canvas) {
            const dims = apiRef.current.matchDimensions(canvas, video, true);
            const resized = apiRef.current.resizeResults(detections, dims);
            apiRef.current.draw.drawDetections(canvas, resized);
          }
        } else {
          setFaceScore(0);
          // Clear canvas
          const canvas = canvasRef?.current;
          if (canvas) {
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        }
      }, 500);
    }

    init();

    return () => {
      running = false;
      clearInterval(intervalRef.current);
    };
  }, [active]);

  /**
   * Captures a PNG snapshot from the video frame.
   * Returns a Blob.
   */
  async function captureSnapshot() {
    const video = videoRef.current;
    if (!video) return null;

    const snap = document.createElement("canvas");
    snap.width = video.videoWidth || 640;
    snap.height = video.videoHeight || 480;
    snap.getContext("2d").drawImage(video, 0, 0);

    return new Promise((resolve) => snap.toBlob(resolve, "image/png"));
  }

  return { faceCount, faceScore, modelsLoading, captureSnapshot };
}