import {
  analyzeAntiSpoofFrame,
  validateAntiSpoofSamples,
} from "./faceAntiSpoof";

/** Один шаг: лицо в круге + проверка живости (текстура + микродвижение). */
export const LIVENESS_TARGETS = [
  {
    id: "live",
    x: 0.5,
    y: 0.46,
    radius: 0.15,
    label: "Подойдите близко и поместите лицо в круг",
  },
];

const STABLE_FRAMES_REQUIRED = 4;
const HOLD_FRAMES_REQUIRED = 9;
const MIN_FACE_WIDTH_RATIO = 0.12;
const SESSION_TIMEOUT_MS = 45000;

const computeVariance = (values) => {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
};

export const getFaceScreenCenter = (detection, videoWidth, videoHeight) => {
  const box = detection.detection.box;
  const cameraX = (box.x + box.width / 2) / videoWidth;
  const cameraY = (box.y + box.height / 2) / videoHeight;
  return {
    x: 1 - cameraX,
    y: cameraY,
    widthRatio: box.width / videoWidth,
  };
};

const isFaceInTarget = (face, target) => {
  const dx = face.x - target.x;
  const dy = face.y - target.y;
  return Math.sqrt(dx * dx + dy * dy) <= target.radius;
};

export const createLivenessSession = () => ({
  targetIndex: 0,
  subPhase: "align",
  stableFrames: 0,
  holdFrames: 0,
  holdTextures: [],
  holdMotions: [],
  lastHoldImage: null,
  targetsHit: [],
  positionHistory: [],
  widthHistory: [],
  finished: false,
  startedAt: Date.now(),
});

export const getCurrentTarget = (session) =>
  LIVENESS_TARGETS[session.targetIndex] ?? null;

const failStep = (session, message, code, target) => ({
  session,
  message,
  completed: false,
  failed: true,
  aligned: false,
  currentTarget: target,
  progress: 0,
  fillRatio: 0,
  code,
});

export const stepLiveness = (session, detection, videoEl) => {
  const elapsed = Date.now() - session.startedAt;
  const target = getCurrentTarget(session);
  const videoWidth = videoEl.videoWidth;
  const videoHeight = videoEl.videoHeight;

  if (session.finished) {
    return {
      session,
      message: "Сохранение…",
      completed: false,
      failed: false,
      aligned: true,
      currentTarget: null,
      progress: 1,
      fillRatio: 1,
    };
  }

  if (!target) {
    return buildCompleted(session, elapsed);
  }

  if (elapsed > SESSION_TIMEOUT_MS) {
    return failStep(session, "Время проверки истекло. Попробуйте снова.", "timeout", target);
  }

  const face = getFaceScreenCenter(detection, videoWidth, videoHeight);

  session.positionHistory.push(face.x);
  session.widthHistory.push(face.widthRatio);
  if (session.positionHistory.length > 20) session.positionHistory.shift();
  if (session.widthHistory.length > 20) session.widthHistory.shift();

  if (face.widthRatio < MIN_FACE_WIDTH_RATIO) {
    return {
      session,
      message: "Подойдите ближе к камере",
      completed: false,
      failed: false,
      aligned: false,
      currentTarget: target,
      progress: 0,
      fillRatio: Math.min(face.widthRatio / MIN_FACE_WIDTH_RATIO, 1),
    };
  }

  const aligned = isFaceInTarget(face, target);

  if (session.subPhase === "align") {
    if (aligned) {
      session.stableFrames += 1;
    } else {
      session.stableFrames = 0;
    }

    const fillRatio = Math.min(session.stableFrames / STABLE_FRAMES_REQUIRED, 1);

    if (session.stableFrames >= STABLE_FRAMES_REQUIRED) {
      session.subPhase = "hold";
      session.holdFrames = 0;
      session.holdTextures = [];
      session.holdMotions = [];
      session.lastHoldImage = null;
      return {
        session,
        message: "Не двигайтесь — проверяем живость…",
        completed: false,
        failed: false,
        aligned: true,
        currentTarget: target,
        progress: 0,
        fillRatio: 0,
      };
    }

    return {
      session,
      message: aligned ? "Держите лицо в круге…" : target.label,
      completed: false,
      failed: false,
      aligned,
      currentTarget: target,
      progress: 0,
      fillRatio,
    };
  }

  if (!aligned) {
    session.subPhase = "align";
    session.stableFrames = 0;
    session.holdFrames = 0;
    session.holdTextures = [];
    session.holdMotions = [];
    session.lastHoldImage = null;
    return {
      session,
      message: "Не выходите из круга",
      completed: false,
      failed: false,
      aligned: false,
      currentTarget: target,
      progress: 0,
      fillRatio: 0,
    };
  }

  const spoof = analyzeAntiSpoofFrame(videoEl, detection, session.lastHoldImage);
  session.lastHoldImage = spoof.imageData;
  session.holdTextures.push(spoof.texture);
  session.holdMotions.push(spoof.motion);
  session.holdFrames += 1;

  const fillRatio = Math.min(session.holdFrames / HOLD_FRAMES_REQUIRED, 1);

  if (session.holdFrames < HOLD_FRAMES_REQUIRED) {
    return {
      session,
      message: "Проверка живости… не двигайтесь",
      completed: false,
      failed: false,
      aligned: true,
      currentTarget: target,
      progress: 0,
      fillRatio,
    };
  }

  const holdCheck = validateAntiSpoofSamples({
    textureScores: session.holdTextures,
    motionScores: session.holdMotions,
  });

  if (!holdCheck.ok) {
    return failStep(session, holdCheck.reason, holdCheck.code ?? "anti_spoof", target);
  }

  session.targetsHit.push(target.id);
  session.targetIndex = LIVENESS_TARGETS.length;

  return buildCompleted(session, elapsed, holdCheck);
};

const buildCompleted = (session, elapsed, holdCheck) => {
  const motionVariance = computeVariance(session.positionHistory);
  const faceWidthRatio =
    session.widthHistory.length > 0 ? Math.max(...session.widthHistory) : 0;

  if (faceWidthRatio < MIN_FACE_WIDTH_RATIO) {
    return failStep(
      session,
      "Подойдите ближе к камере — фото не подойдёт.",
      "face_too_small",
      null,
    );
  }

  return {
    session: { ...session, targetIndex: LIVENESS_TARGETS.length, finished: true },
    message: "Проверка пройдена, вход…",
    completed: true,
    failed: false,
    aligned: true,
    currentTarget: null,
    progress: 1,
    fillRatio: 1,
    proof: {
      passed: true,
      version: 4,
      targets_hit: session.targetsHit,
      motion_variance: motionVariance,
      face_width_ratio: faceWidthRatio,
      avg_texture: holdCheck.avgTexture,
      avg_micro_motion: holdCheck.avgMotion,
      duration_ms: elapsed,
    },
  };
};

export const resetLivenessSession = () => createLivenessSession();
