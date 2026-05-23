const MODEL_URL = `${import.meta.env.BASE_URL}models`.replace(/([^:]\/)\/+/g, "$1");

let faceApiModule = null;
let livenessModelsPromise = null;
let recognitionModelPromise = null;

const loadFaceApi = async () => {
  if (!faceApiModule) {
    faceApiModule = await import("@vladmandic/face-api");
  }
  return faceApiModule;
};

/** TinyFace + landmarks (~450 KB) — для liveness в реальном времени. */
export const loadLivenessModels = async () => {
  if (!livenessModelsPromise) {
    livenessModelsPromise = (async () => {
      const faceapi = await loadFaceApi();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      ]);
    })().catch((err) => {
      livenessModelsPromise = null;
      throw err;
    });
  }
  return livenessModelsPromise;
};

/** Recognition (~4 MB) — только перед сохранением лица / входом. */
export const loadRecognitionModel = async () => {
  await loadLivenessModels();
  if (!recognitionModelPromise) {
    recognitionModelPromise = (async () => {
      const faceapi = await loadFaceApi();
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    })().catch((err) => {
      recognitionModelPromise = null;
      throw err;
    });
  }
  return recognitionModelPromise;
};

export const loadFaceModels = async () => {
  await loadLivenessModels();
  await loadRecognitionModel();
};

/** Фоновая предзагрузка после login — без тяжёлой recognition-модели. */
export const prefetchLivenessModels = () => {
  void loadLivenessModels().catch(() => {});
};

export const isCameraAvailable = async () => {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
};

const runDetection = async (videoEl, { minConfidence = 0.45, withDescriptor = false } = {}) => {
  if (!videoEl?.videoWidth) return null;

  const faceapi = await loadFaceApi();
  await loadLivenessModels();
  if (withDescriptor) {
    await loadRecognitionModel();
  }

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 224,
    scoreThreshold: minConfidence,
  });

  let pipeline = faceapi.detectSingleFace(videoEl, options).withFaceLandmarks();
  if (withDescriptor) {
    pipeline = pipeline.withFaceDescriptor();
  }

  const detection = await pipeline;
  if (!detection) return null;

  return {
    detection,
    score: detection.detection.score,
    descriptor: withDescriptor ? Array.from(detection.descriptor) : null,
  };
};

export const detectFaceForLiveness = async (videoEl, { minConfidence = 0.45 } = {}) =>
  runDetection(videoEl, { minConfidence, withDescriptor: false });

export const detectFaceInVideo = async (videoEl, { minConfidence = 0.45 } = {}) =>
  runDetection(videoEl, { minConfidence, withDescriptor: true });

export const captureFaceFromVideo = async (videoEl) => {
  const found = await detectFaceInVideo(videoEl, { minConfidence: 0.45 });
  if (!found?.descriptor) {
    throw new Error("Лицо не найдено. Смотрите прямо в камеру.");
  }

  return {
    descriptor: found.descriptor,
    imageBase64: videoFrameToImageBase64(videoEl),
  };
};

export const drawFaceOverlay = (videoEl, canvasEl, detection, faceapi) => {
  if (!videoEl?.videoWidth || !canvasEl || !detection) return;

  canvasEl.width = videoEl.videoWidth;
  canvasEl.height = videoEl.videoHeight;

  const ctx = canvasEl.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  const resized = faceapi.resizeResults(detection, {
    width: videoEl.videoWidth,
    height: videoEl.videoHeight,
  });
  faceapi.draw.drawDetections(canvasEl, resized);
};

export const videoFrameToImageBase64 = (videoEl, quality = 0.88) => {
  const canvas = document.createElement("canvas");
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Не удалось обработать изображение.");
  }
  ctx.drawImage(videoEl, 0, 0);
  return canvas.toDataURL("image/jpeg", quality);
};

export const getFaceApi = loadFaceApi;
