const scratchCanvas = document.createElement("canvas");
const scratchCtx = scratchCanvas.getContext("2d", { willReadFrequently: true });

export const sampleFaceRegion = (videoEl, box) => {
  const videoWidth = videoEl.videoWidth;
  const videoHeight = videoEl.videoHeight;
  const pad = 0.08;
  const x = Math.max(0, box.x - box.width * pad);
  const y = Math.max(0, box.y - box.height * pad);
  const w = Math.min(box.width * (1 + pad * 2), videoWidth - x);
  const h = Math.min(box.height * (1 + pad * 2), videoHeight - y);
  const size = Math.max(64, Math.min(128, Math.round(Math.max(w, h))));

  scratchCanvas.width = size;
  scratchCanvas.height = size;
  scratchCtx.drawImage(videoEl, x, y, w, h, 0, 0, size, size);
  return scratchCtx.getImageData(0, 0, size, size);
};

export const laplacianVariance = (imageData) => {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);

  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const lap =
        -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width];
      sum += lap;
      sumSq += lap * lap;
      count += 1;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
};

export const meanAbsoluteDiff = (prev, next) => {
  if (!prev || !next || prev.data.length !== next.data.length) return 0;

  let sum = 0;
  const pixels = prev.data.length / 4;
  for (let i = 0; i < prev.data.length; i += 4) {
    sum +=
      Math.abs(prev.data[i] - next.data[i]) +
      Math.abs(prev.data[i + 1] - next.data[i + 1]) +
      Math.abs(prev.data[i + 2] - next.data[i + 2]);
  }
  return sum / pixels / 3;
};

/** Снимок области лица + текстура + микродвижение между кадрами. */
export const analyzeAntiSpoofFrame = (videoEl, detection, previousImageData) => {
  const imageData = sampleFaceRegion(videoEl, detection.detection.box);
  const texture = laplacianVariance(imageData);
  const motion = previousImageData ? meanAbsoluteDiff(previousImageData, imageData) : 0;
  return { imageData, texture, motion };
};

export const MIN_TEXTURE_SCORE = 18;
export const MIN_MICRO_MOTION = 0.8;
export const MIN_DESCRIPTOR_SPREAD = 0.018;

export const validateAntiSpoofSamples = ({ textureScores, motionScores }) => {
  if (textureScores.length < 4) {
    return { ok: false, reason: "Недостаточно данных для проверки живости." };
  }

  const avgTexture = textureScores.reduce((a, b) => a + b, 0) / textureScores.length;
  const motionValues = motionScores.filter((v) => v > 0);
  const avgMotion =
    motionValues.length > 0
      ? motionValues.reduce((a, b) => a + b, 0) / motionValues.length
      : 0;

  if (avgTexture < MIN_TEXTURE_SCORE) {
    return {
      ok: false,
      reason: "Похоже на фото или печать. Используйте живое лицо перед камерой.",
      code: "printed_image",
      avgTexture,
      avgMotion,
    };
  }

  if (avgMotion < MIN_MICRO_MOTION) {
    return {
      ok: false,
      reason: "Обнаружено статичное изображение. Нельзя использовать фото паспорта.",
      code: "static_image",
      avgTexture,
      avgMotion,
    };
  }

  return { ok: true, avgTexture, avgMotion };
};

export const validateDescriptorSpread = (descriptors) => {
  if (descriptors.length < 2) return { ok: true, spread: 0 };

  let minDist = Infinity;
  for (let i = 0; i < descriptors.length; i += 1) {
    for (let j = i + 1; j < descriptors.length; j += 1) {
      let sum = 0;
      for (let k = 0; k < descriptors[i].length; k += 1) {
        const d = descriptors[i][k] - descriptors[j][k];
        sum += d * d;
      }
      minDist = Math.min(minDist, Math.sqrt(sum));
    }
  }

  if (minDist < MIN_DESCRIPTOR_SPREAD) {
    return {
      ok: false,
      reason: "Одно и то же фото не подходит. Нужно живое лицо.",
      code: "same_frame",
      spread: minDist,
    };
  }

  return { ok: true, spread: minDist };
};
