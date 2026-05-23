import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../config";
import { authFetch } from "../api/client";
import { isCameraAvailable } from "../utils/faceRecognition";
import FaceCaptureModal from "./FaceCaptureModal";

const FaceIdIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="4" strokeWidth="1.8" />
    <circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="10" r="1.2" fill="currentColor" stroke="none" />
    <path d="M8.5 15.5c1 1.2 6 1.2 7 0" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const FaceIdSettings = () => {
  const [status, setStatus] = useState({ enabled: false, face_preview_url: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [cameraAvailable, setCameraAvailable] = useState(null);
  const [captureOpen, setCaptureOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void isCameraAvailable().then((available) => {
      if (active) setCameraAvailable(available);
    });
    return () => {
      active = false;
    };
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("face/status/");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail ?? "Не удалось загрузить статус Face ID.");
        setStatus({ enabled: false, face_preview_url: null });
        return;
      }
      setStatus(data);
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleCaptureRegister = async ({ descriptor, imageBase64, liveness }) => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await authFetch("face/register/", {
        method: "POST",
        body: JSON.stringify({
          descriptor,
          image_base64: imageBase64,
          liveness,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail ?? "Не удалось сохранить Face ID.");
      }
      setSuccess(data.detail ?? "Face ID сохранён на сервере.");
      setCaptureOpen(false);
      await loadStatus();
    } catch (err) {
      setError(err.message ?? "Не удалось настроить Face ID.");
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    const ok = window.confirm("Удалить Face ID с сервера? Фото лица будет удалено.");
    if (!ok) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await authFetch("face/", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "Не удалось удалить Face ID.");
      }
      setSuccess("Face ID удалён с сервера.");
      await loadStatus();
    } catch (err) {
      setError(err.message ?? "Ошибка удаления.");
    } finally {
      setBusy(false);
    }
  };

  if (loading || cameraAvailable === null) {
    return <p className="text-sm text-muted">Проверка Face ID…</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted bg-secondary/40 border border-border rounded-lg px-3 py-2">
        Face ID WMS: один шаг — подойдите близко, лицо в круг, не двигайтесь. Фото паспорта не подойдёт.
      </p>

      {!cameraAvailable ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Камера недоступна. Для Face ID нужен компьютер или телефон с фронтальной камерой.
        </p>
      ) : null}

      {status.enabled && status.face_preview_url ? (
        <div className="flex items-center gap-4 rounded-lg border border-border bg-secondary/30 p-3">
          <img
            src={status.face_preview_url}
            alt="Сохранённое фото лица"
            className="w-16 h-16 rounded-lg object-cover border border-border"
          />
          <div className="min-w-0">
            <div className="text-sm font-medium text-primary">Face ID активен</div>
            {status.registered_at ? (
              <div className="text-xs text-muted">
                с {new Date(status.registered_at).toLocaleDateString("ru-RU")}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Face ID не настроен. Можно войти только по паролю.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCaptureOpen(true)}
          disabled={busy || !cameraAvailable}
          aria-label={status.enabled ? "Обновить Face ID" : "Настроить Face ID"}
          tabIndex={0}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
        >
          <FaceIdIcon className="w-5 h-5" />
          {busy ? "Сохранение…" : status.enabled ? "Обновить лицо" : "Настроить Face ID"}
        </button>

        {status.enabled ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            aria-label="Удалить Face ID"
            tabIndex={0}
            className="px-4 py-2.5 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50 disabled:opacity-50"
          >
            Удалить
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-green-600" role="status">
          {success}
        </p>
      ) : null}

      <FaceCaptureModal
        open={captureOpen}
        busy={busy}
        title={status.enabled ? "Обновить Face ID" : "Настроить Face ID"}
        hint="Подойдите близко, поместите лицо в круг и не двигайтесь."
        onClose={() => setCaptureOpen(false)}
        onCapture={handleCaptureRegister}
      />
    </div>
  );
};

export const loginWithFaceId = async (phoneDigits, { descriptor, liveness }) => {
  const res = await fetch(`${API_URL}face/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: phoneDigits, descriptor, liveness }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail ?? "Face ID не подтверждён.");
  }
  return data;
};

export default FaceIdSettings;
