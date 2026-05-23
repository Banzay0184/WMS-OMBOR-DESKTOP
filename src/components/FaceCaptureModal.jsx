import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectFaceForLiveness,
  detectFaceInVideo,
  drawFaceOverlay,
  getFaceApi,
  loadLivenessModels,
  videoFrameToImageBase64,
} from "../utils/faceRecognition";
import {
  createLivenessSession,
  LIVENESS_TARGETS,
  resetLivenessSession,
  stepLiveness,
} from "../utils/faceLiveness";

const SCAN_INTERVAL_MS = 180;
const MIN_FACE_SCORE = 0.45;
const SESSION_TIMEOUT_MS = 60000;

const TargetCircle = ({ target, aligned, fillRatio }) => {
  if (!target) return null;

  const size = target.radius * 200;
  const left = (target.x - target.radius) * 100;
  const top = (target.y - target.radius) * 100;

  return (
    <div
      className="absolute pointer-events-none transition-all duration-500 ease-out"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: `${size}%`,
        height: `${size}%`,
      }}
      aria-hidden="true"
    >
      <div
        className={`absolute inset-0 rounded-full border-4 transition-colors duration-200 ${
          aligned ? "border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.6)]" : "border-white/90"
        }`}
      />
      <div
        className="absolute inset-0 rounded-full bg-green-400/25 transition-transform duration-150 origin-center"
        style={{ transform: `scale(${fillRatio})` }}
      />
    </div>
  );
};

export const FaceCaptureModal = ({
  open,
  title = "Face ID",
  hint = "Подойдите близко, поместите лицо в круг и не двигайтесь.",
  busy = false,
  onClose,
  onCapture,
}) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);
  const scanningRef = useRef(false);
  const scanInProgressRef = useRef(false);
  const submitLockedRef = useRef(false);
  const livenessRef = useRef(createLivenessSession());
  const busyRef = useRef(busy);
  const faceApiRef = useRef(null);

  const [starting, setStarting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Запуск камеры…");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [currentTarget, setCurrentTarget] = useState(LIVENESS_TARGETS[0]);
  const [aligned, setAligned] = useState(false);
  const [fillRatio, setFillRatio] = useState(0);

  busyRef.current = busy;

  const stopScanTimer = useCallback(() => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopScanTimer();
    scanningRef.current = false;
    scanInProgressRef.current = false;
    submitLockedRef.current = false;
    livenessRef.current = createLivenessSession();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stopScanTimer]);

  const resetAfterError = useCallback((message) => {
    stopScanTimer();
    setError(message);
    scanningRef.current = false;
    scanInProgressRef.current = false;
    submitLockedRef.current = false;
    setVerifying(false);
    livenessRef.current = resetLivenessSession();
    setCurrentTarget(LIVENESS_TARGETS[0]);
    setAligned(false);
    setFillRatio(0);
    setStatusMessage(LIVENESS_TARGETS[0].label);
  }, [stopScanTimer]);

  const runAutoScan = useCallback(async () => {
    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;
    if (
      !videoEl?.videoWidth ||
      !canvasEl ||
      scanningRef.current ||
      busyRef.current ||
      scanInProgressRef.current
    ) {
      return;
    }

    const sessionAge = Date.now() - livenessRef.current.startedAt;
    if (sessionAge > SESSION_TIMEOUT_MS) {
      resetAfterError("Время проверки истекло. Попробуйте снова.");
      return;
    }

    scanInProgressRef.current = true;

    try {
      const found = await detectFaceForLiveness(videoEl, {
        minConfidence: MIN_FACE_SCORE,
      });

      if (!found || found.score < MIN_FACE_SCORE) {
        setStatusMessage("Лицо не видно — смотрите в камеру");
        setAligned(false);
        setFillRatio(0);
        const ctx = canvasEl.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        return;
      }

      if (!faceApiRef.current) {
        faceApiRef.current = await getFaceApi();
      }
      drawFaceOverlay(videoEl, canvasEl, found.detection, faceApiRef.current);

      const livenessStep = stepLiveness(
        livenessRef.current,
        found.detection,
        videoEl,
      );
      livenessRef.current = livenessStep.session;
      setStatusMessage(livenessStep.message);
      setCurrentTarget(livenessStep.currentTarget ?? LIVENESS_TARGETS[0]);
      setAligned(Boolean(livenessStep.aligned));
      setFillRatio(livenessStep.fillRatio ?? 0);

      if (livenessStep.failed) {
        resetAfterError(livenessStep.message);
        return;
      }

      if (!livenessStep.completed) return;

      if (submitLockedRef.current) return;
      submitLockedRef.current = true;
      stopScanTimer();

      scanningRef.current = true;
      setVerifying(true);
      setError("");
      setStatusMessage("Сверяем лицо…");

      const fullMatch = await detectFaceInVideo(videoEl, { minConfidence: MIN_FACE_SCORE });
      if (!fullMatch?.descriptor) {
        throw new Error("Не удалось считать лицо. Попробуйте снова.");
      }

      await onCapture({
        descriptor: fullMatch.descriptor,
        imageBase64: videoFrameToImageBase64(videoEl),
        liveness: livenessStep.proof,
      });
      stopCamera();
    } catch (err) {
      resetAfterError(err.message ?? "Не удалось распознать лицо.");
    } finally {
      scanInProgressRef.current = false;
    }
  }, [onCapture, resetAfterError, stopCamera, stopScanTimer]);

  const startCamera = useCallback(async () => {
    setStarting(true);
    setStatusMessage("Запуск камеры…");
    setError("");
    setVerifying(false);
    submitLockedRef.current = false;
    livenessRef.current = createLivenessSession();
    setCurrentTarget(LIVENESS_TARGETS[0]);
    setAligned(false);
    setFillRatio(0);
    faceApiRef.current = null;

    try {
      await loadLivenessModels();
      faceApiRef.current = await getFaceApi();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatusMessage(LIVENESS_TARGETS[0].label);
      scanTimerRef.current = setInterval(() => {
        void runAutoScan();
      }, SCAN_INTERVAL_MS);
    } catch (err) {
      setError(err.message ?? "Не удалось открыть камеру.");
    } finally {
      setStarting(false);
    }
  }, [runAutoScan]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setError("");
      setVerifying(false);
      setStatusMessage("Запуск камеры…");
      return undefined;
    }
    void startCamera();
    return () => {
      stopCamera();
    };
  }, [open, startCamera, stopCamera]);

  const handleClose = () => {
    if (busy || verifying) return;
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl border border-border">
        <h3 className="text-lg font-medium text-primary mb-1">{title}</h3>
        <p className="text-sm text-muted mb-4">{hint}</p>

        <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black mb-3">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
            playsInline
            muted
            aria-label="Видео с камеры"
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1] pointer-events-none opacity-40"
            aria-hidden="true"
          />
          {!starting && !verifying ? (
            <TargetCircle target={currentTarget} aligned={aligned} fillRatio={fillRatio} />
          ) : null}
          <div
            className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-3 text-white text-sm text-center"
            role="status"
            aria-live="polite"
          >
            {starting ? "Загрузка…" : statusMessage}
          </div>
          {starting ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-sm">
              Загрузка моделей…
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between text-xs text-muted mb-3">
          <span>Проверка живости</span>
          {aligned ? <span className="text-green-600 font-medium">Лицо в круге</span> : null}
        </div>

        <p className="text-xs text-muted mb-3">
          Подойдите близко, поместите лицо в круг и не двигайтесь. Фото паспорта не подойдёт.
        </p>

        {error ? (
          <div className="mb-3 space-y-2">
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
              {error}
            </p>
            <button
              type="button"
              onClick={() => {
                setError("");
                submitLockedRef.current = false;
                livenessRef.current = resetLivenessSession();
                setCurrentTarget(LIVENESS_TARGETS[0]);
                setAligned(false);
                setFillRatio(0);
                setStatusMessage(LIVENESS_TARGETS[0].label);
                if (!scanTimerRef.current && videoRef.current?.srcObject) {
                  scanTimerRef.current = setInterval(() => {
                    void runAutoScan();
                  }, SCAN_INTERVAL_MS);
                }
              }}
              className="w-full py-2 rounded-lg border border-border text-sm text-primary hover:bg-secondary"
            >
              Повторить
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleClose}
          disabled={busy || verifying}
          aria-label="Отмена"
          tabIndex={0}
          className="w-full py-2.5 rounded-lg border border-border text-sm text-muted hover:bg-secondary disabled:opacity-50"
        >
          Отмена
        </button>
      </div>
    </div>
  );
};

export default FaceCaptureModal;
