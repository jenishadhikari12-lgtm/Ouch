import React, { useEffect, useRef, useState } from "react";

const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const loadVisionTasks = async () =>
  import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm");

const RIGHT_EYE = [362, 385, 387, 263, 373, 380];
const WASM_PATH =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";
const MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

const distance2D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const eyeAspectRatio = (landmarks, idx) => {
  const [p0, p1, p2, p3, p4, p5] = idx.map((i) => landmarks[i]);
  const horizontal = distance2D(p0, p3);
  if (!horizontal) return 0;
  return (distance2D(p1, p5) + distance2D(p2, p4)) / (2 * horizontal);
};

const mouthRatio = (landmarks) => {
  const upper = landmarks[13];
  const lower = landmarks[14];
  const left = landmarks[61];
  const right = landmarks[291];
  const horizontal = distance2D(left, right);
  if (!horizontal) return 0;
  return distance2D(upper, lower) / horizontal;
};

const getHeadPoseAndDepth = (landmarks) => {
  const nose = landmarks[1];
  const left = landmarks[234];
  const right = landmarks[454];

  const faceW = right.x - left.x;
  if (faceW <= 0) {
    return { direction: "CENTER", depth: 0 };
  }

  const rel = (nose.x - left.x) / faceW;
  const direction = rel < 0.25 ? "LEFT" : rel > 0.75 ? "RIGHT" : "CENTER";
  const depth = Math.abs(nose.z - (left.z + right.z) / 2);

  return { direction, depth };
};

const getFaceBounds = (video, landmarks) => {
  const w = video.videoWidth;
  const h = video.videoHeight;

  const xs = landmarks.map((lm) => Math.round(lm.x * w));
  const ys = landmarks.map((lm) => Math.round(lm.y * h));

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const padX = Math.round((maxX - minX) * 0.25);
  const padY = Math.round((maxY - minY) * 0.35);

  return {
    x1: Math.max(0, minX - padX),
    y1: Math.max(0, minY - padY),
    x2: Math.min(w, maxX + padX),
    y2: Math.min(h, maxY + padY),
  };
};

const makeLivenessSession = () => {
  const tasks = ["BLINK", "TURN_LEFT", "TURN_RIGHT", "OPEN_MOUTH"];
  for (let i = tasks.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
  }
  return {
    tasks,
    idx: -1,
    counter: 0,
    active: true,
  };
};

const LiveSelfieCapture = ({ onCapture, onClear }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const rafRef = useRef(0);
  const holdStartRef = useRef(null);
  const stabilityBufferRef = useRef([]);
  const depthHistoryRef = useRef([]);
  const livenessRef = useRef(makeLivenessSession());

  const [showCamera, setShowCamera] = useState(false);
  const [preview, setPreview] = useState(null);
  const [statusText, setStatusText] = useState("Open your camera to start.");
  const [errorText, setErrorText] = useState("");
  const [livenessReady, setLivenessReady] = useState(false);

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setShowCamera(false);
  };

  const resetSessionState = () => {
    holdStartRef.current = null;
    stabilityBufferRef.current = [];
    depthHistoryRef.current = [];
    livenessRef.current = makeLivenessSession();
  };

  const spoofCheck = (depth) => {
    const history = depthHistoryRef.current;
    history.push(depth);
    if (history.length > 50) history.shift();
    if (history.length < 50) return true;

    const mean = history.reduce((sum, v) => sum + v, 0) / history.length;
    const variance =
      history.reduce((sum, v) => sum + (v - mean) ** 2, 0) / history.length;

    return variance > 5e-8;
  };

  const isFaceStable = (landmarks) => {
    const buffer = stabilityBufferRef.current;
    buffer.push([landmarks[1].x, landmarks[1].y]);
    if (buffer.length > 15) buffer.shift();
    if (buffer.length < 15) return false;

    const xs = buffer.map((b) => b[0]);
    const ys = buffer.map((b) => b[1]);
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
    const stdX = Math.sqrt(xs.reduce((s, x) => s + (x - meanX) ** 2, 0) / xs.length);
    const stdY = Math.sqrt(ys.reduce((s, y) => s + (y - meanY) ** 2, 0) / ys.length);

    return Math.max(stdX, stdY) < 0.006;
  };

  const captureCroppedFace = (landmarks) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const bounds = getFaceBounds(video, landmarks);
    const width = Math.max(1, bounds.x2 - bounds.x1);
    const height = Math.max(1, bounds.y2 - bounds.y1);

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(
      video,
      bounds.x1,
      bounds.y1,
      width,
      height,
      0,
      0,
      width,
      height,
    );

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setPreview(dataUrl);
    onCapture?.(dataUrl);
    setStatusText("Liveness passed. Face captured.");
    stopCamera();
  };

  const capturePhotoFallback = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setPreview(dataUrl);
    onCapture?.(dataUrl);
    setStatusText("Photo captured.");
    stopCamera();
  };

  const evaluateLivenessTask = (landmarks) => {
    const session = livenessRef.current;
    if (!session.active) return;

    const { direction, depth } = getHeadPoseAndDepth(landmarks);
    if (!spoofCheck(depth)) {
      setErrorText("Spoof detected. Please retry.");
      setStatusText("Liveness failed.");
      session.active = false;
      stopCamera();
      return;
    }

    const task = session.tasks[session.idx];
    let passed = false;

    if (task === "BLINK") {
      const ear =
        (eyeAspectRatio(landmarks, LEFT_EYE) +
          eyeAspectRatio(landmarks, RIGHT_EYE)) /
        2;
      if (ear < 0.18) session.counter += 1;
      if (session.counter >= 2) passed = true;
    } else if (task === "OPEN_MOUTH") {
      if (mouthRatio(landmarks) > 0.5) session.counter += 1;
      if (session.counter >= 5) passed = true;
    } else if (task.startsWith("TURN_")) {
      const expected = task.split("_")[1];
      if (direction === expected) session.counter += 1;
      if (session.counter >= 6) passed = true;
    }

    if (passed) {
      session.idx += 1;
      session.counter = 0;

      if (session.idx >= session.tasks.length) {
        session.active = false;
        captureCroppedFace(landmarks);
      }
    }

    if (session.active) {
      setStatusText(`Liveness task: ${task.replace("_", " ")}`);
    }
  };

  const processFrame = () => {
    const detector = faceLandmarkerRef.current;
    const video = videoRef.current;

    if (!detector || !video || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const result = detector.detectForVideo(video, performance.now());

    if (result.faceLandmarks?.length) {
      const landmarks = result.faceLandmarks[0];
      const { direction } = getHeadPoseAndDepth(landmarks);
      const mouth = mouthRatio(landmarks);

      if (livenessRef.current.idx < 0 && !preview) {
        const stable = isFaceStable(landmarks);
        if (direction === "CENTER" && mouth < 0.2 && stable) {
          if (holdStartRef.current === null) holdStartRef.current = Date.now();
          const elapsed = (Date.now() - holdStartRef.current) / 1000;
          const remaining = Math.max(0, 2 - elapsed).toFixed(1);
          setStatusText(`Hold still ${remaining}s`);
          if (elapsed >= 2) {
            setStatusText("Starting liveness tasks...");
            livenessRef.current.idx = 0;
          }
        } else {
          holdStartRef.current = null;
          setStatusText("Center face and close mouth");
        }
      }

      if (livenessRef.current.idx >= 0 && !preview) {
        evaluateLivenessTask(landmarks);
      }
    } else {
      holdStartRef.current = null;
      setStatusText("No face detected");
    }

    rafRef.current = requestAnimationFrame(processFrame);
  };

  useEffect(() => {
    const startCamera = async () => {
      if (!showCamera) return;
      if (!navigator?.mediaDevices?.getUserMedia) {
        setErrorText("Camera API not supported by this browser.");
        return;
      }

      try {
        setErrorText("");
        setStatusText("Loading liveness model...");
        resetSessionState();
        setLivenessReady(false);

        if (!faceLandmarkerRef.current) {
          try {
            const { FilesetResolver, FaceLandmarker } = await loadVisionTasks();
            const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
            faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(
              vision,
              {
                baseOptions: { modelAssetPath: MODEL_PATH },
                runningMode: "VIDEO",
                numFaces: 1,
                minFaceDetectionConfidence: 0.4,
                minFacePresenceConfidence: 0.4,
                minTrackingConfidence: 0.4,
              },
            );
          } catch (importError) {
            console.error(importError);
            setErrorText(
              "Liveness model could not be loaded. Falling back to standard photo capture.",
            );
          }
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 } },
          audio: false,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (faceLandmarkerRef.current) {
          setLivenessReady(true);
          setStatusText("Center your face to begin");
          rafRef.current = requestAnimationFrame(processFrame);
        } else {
          setLivenessReady(false);
          setStatusText("Liveness unavailable. You can still capture a selfie.");
        }
      } catch (err) {
        console.error(err);
        setErrorText("Unable to start liveness camera.");
        stopCamera();
      }
    };

    startCamera();

    return () => {
      if (showCamera) stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCamera]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <p className="text-sm font-medium text-slate-700">Live Selfie (Liveness)</p>
      <p className="mt-1 text-xs text-slate-500">
        Keep your face centered, then follow random liveness instructions.
      </p>

      <p className="mt-3 text-xs font-medium text-slate-700">{statusText}</p>
      {errorText ? <p className="mt-1 text-xs text-red-600">{errorText}</p> : null}

      {!showCamera && !preview && (
        <button
          type="button"
          onClick={() => setShowCamera(true)}
          className="mt-3 cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Start Liveness Check
        </button>
      )}

      {showCamera && (
        <div className="mt-4">
          <video
            ref={videoRef}
            className="w-full rounded-xl bg-black"
            muted
            playsInline
          />

          <div className="mt-3 flex gap-3">
            {!livenessReady ? (
              <button
                type="button"
                onClick={capturePhotoFallback}
                className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Capture
              </button>
            ) : null}

            <button
              type="button"
              onClick={stopCamera}
              className="cursor-pointer rounded-lg border px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {preview && (
        <div className="mt-4">
          <img src={preview} alt="Live face capture" className="w-full rounded-xl border" />
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              resetSessionState();
              setStatusText("Open your camera to start.");
              setErrorText("");
              onClear?.();
            }}
            className="mt-3 cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Retake
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default LiveSelfieCapture;
