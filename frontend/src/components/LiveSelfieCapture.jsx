import React, { useEffect, useRef, useState } from "react";

const LiveSelfieCapture = ({ onCapture, onClear }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [showCamera, setShowCamera] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const livenessApiBase =
    import.meta.env.VITE_LIVENESS_API_BASE_URL || "http://localhost:8003";

  useEffect(() => {
    const startCamera = async () => {
      if (!showCamera) return;
      if (!navigator?.mediaDevices?.getUserMedia) {
        alert("Camera API not supported.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error(err);
        alert("Camera error: " + err.name);
        stopCamera();
      }
    };

    startCamera();

    return () => {
      if (!showCamera) return;
      stopCamera();
    };
  }, [showCamera]);

  const stopCamera = () => {
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

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setPreview(dataUrl);
    onCapture?.(dataUrl);

    stopCamera();
  };

  const runPythonLiveness = async () => {
    setBusy(true);
    try {
      const response = await fetch(`${livenessApiBase}/api/liveness/run`, {
        method: "POST",
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.detail || "Liveness API call failed");
      }

      if (!payload.passed) {
        throw new Error(payload.message || "Active liveness check failed.");
      }

      if (!payload.image) {
        throw new Error("Liveness passed but no selfie image was returned.");
      }

      setPreview(payload.image);
      onCapture?.(payload.image);
      alert("Active liveness passed. Selfie captured.");
    } catch (error) {
      console.error(error);
      alert(
        `Active liveness failed: ${error.message}. Please ensure backend API is running and complete all on-screen liveness prompts.`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <p className="text-sm font-medium text-slate-700">Live Selfie</p>
      <p className="mt-1 text-xs text-slate-500">
        Use either browser capture or Python active liveness verification.
      </p>

      {!showCamera && !preview && (
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={runPythonLiveness}
            disabled={busy}
            className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Running Active Liveness..." : "Run Active Liveness (Python)"}
          </button>
        </div>
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
            <button
              type="button"
              onClick={capturePhoto}
              className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Capture
            </button>

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
          <img src={preview} alt="Selfie" className="w-full rounded-xl border" />
          <button
            type="button"
            onClick={() => {
              setPreview(null);
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
