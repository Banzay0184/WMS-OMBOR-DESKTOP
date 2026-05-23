import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, COMPANY } from "../config";
import { useAuth } from "../context/AuthContext";
import { resolveSingleContextTarget } from "../utils/contextZones";
import { formatPhoneDisplay, getPhoneDigits, PHONE_PLACEHOLDER } from "../utils/phone";
import { isCameraAvailable } from "../utils/faceRecognition";
import FaceCaptureModal from "./FaceCaptureModal";
import { loginWithFaceId } from "./FaceIdSettings";

const EyeIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const EyeOffIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
  </svg>
);

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, setActiveContext, clearActiveContext } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [faceIdLoading, setFaceIdLoading] = useState(false);
  const [faceIdSupported, setFaceIdSupported] = useState(false);
  const [faceCaptureOpen, setFaceCaptureOpen] = useState(false);
  const [pendingPhoneDigits, setPendingPhoneDigits] = useState("");

  useEffect(() => {
    let active = true;
    void isCameraAvailable().then((available) => {
      if (active) setFaceIdSupported(available);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleLoginSuccess = (data) => {
    if (!data.access || !data.user) return false;
    const tokens = { access: data.access, refresh: data.refresh ?? null };
    const contexts = data.available_contexts ?? null;
    login(data.user, tokens, contexts);

    const singleTarget = resolveSingleContextTarget(contexts);
    if (singleTarget) {
      if (singleTarget.type === "platform") {
        setActiveContext("platform");
      } else if (singleTarget.type === "pos") {
        setActiveContext("pos", singleTarget.organizationId);
      } else {
        setActiveContext("organization", singleTarget.organizationId);
      }
      navigate(singleTarget.path);
      return true;
    }

    clearActiveContext();
    navigate("/select-context");
    return true;
  };

  const handleTogglePassword = () => setShowPassword((prev) => !prev);
  const handlePhoneChange = (e) => setPhone(formatPhoneDisplay(e.target.value));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const phoneDigits = getPhoneDigits(phone);
    if (!phoneDigits || !password) {
      setError("Введите номер телефона и пароль");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneDigits, password }),
      });

      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        setError(data.detail ?? data.message ?? "Ошибка входа");
        setIsLoading(false);
        return;
      }

      if (data.access && data.user) {
        handleLoginSuccess(data);
      }
    } catch (err) {
      setError(err.message ?? "Ошибка сети");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFaceIdLoginClick = () => {
    setError("");
    const phoneDigits = getPhoneDigits(phone);
    if (!phoneDigits) {
      setError("Сначала введите номер телефона для Face ID.");
      return;
    }
    setPendingPhoneDigits(phoneDigits);
    setFaceCaptureOpen(true);
  };

  const handleFaceCaptureLogin = async ({ descriptor, liveness }) => {
    setFaceIdLoading(true);
    setError("");
    try {
      const data = await loginWithFaceId(pendingPhoneDigits, { descriptor, liveness });
      setFaceCaptureOpen(false);
      handleLoginSuccess(data);
    } catch (err) {
      setError(err.message ?? "Не удалось войти по Face ID.");
      throw err;
    } finally {
      setFaceIdLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center bg-no-repeat px-4 py-8 sm:px-6 sm:py-10"
      style={{
        backgroundImage: `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url('https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1920')`,
      }}
    >
      <div className="w-full max-w-sm">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-soft p-6 sm:p-8 border border-white/20">
          <div className="text-center mb-2 sm:mb-4">
            <img src={COMPANY.logo} alt="WMS" className="w-16 mx-auto mb-2" />
            <p className="text-muted text-lg mt-1">Вход в систему</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-muted mb-1.5">
                Номер телефона
              </label>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={handlePhoneChange}
                placeholder={PHONE_PLACEHOLDER}
                autoComplete="tel"
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                aria-label="Номер телефона"
                disabled={isLoading || faceIdLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-muted mb-1.5">
                Пароль
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  autoComplete="current-password"
                  className="w-full px-4 py-2.5 pr-11 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                  aria-label="Пароль"
                  disabled={isLoading || faceIdLoading}
                />
                <button
                  type="button"
                  onClick={handleTogglePassword}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-muted hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  tabIndex={0}
                >
                  {showPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || faceIdLoading}
              className="w-full py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {isLoading ? "Вход…" : "Войти"}
            </button>

            {faceIdSupported ? (
              <>
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-2 text-muted">или</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleFaceIdLoginClick}
                  disabled={isLoading || faceIdLoading}
                  aria-label="Войти с Face ID"
                  tabIndex={0}
                  className="w-full py-2.5 rounded-lg border border-border bg-white text-primary font-medium hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {faceIdLoading ? "Face ID…" : "Войти с Face ID"}
                </button>
                <p className="text-xs text-muted text-center">
                  Подойдите близко и держите лицо в круге. Пароль остаётся основным способом входа.
                </p>
              </>
            ) : null}
          </form>
        </div>

        <footer className="mt-6 sm:mt-8 text-center text-white/90 text-sm">
          <p className="font-medium">{COMPANY.name}</p>
          {COMPANY.description && (
            <p className="text-white/70 text-xs mt-0.5">{COMPANY.description}</p>
          )}
          {COMPANY.contact && <p className="text-white/70 text-xs mt-1">{COMPANY.contact}</p>}
          {COMPANY.feedbackUrl && (
            <a
              href={COMPANY.feedbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 text-white/90 underline underline-offset-2 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50 rounded"
            >
              {COMPANY.feedbackLabel}
            </a>
          )}
        </footer>
      </div>

      <FaceCaptureModal
        open={faceCaptureOpen}
        busy={faceIdLoading}
        title="Вход по Face ID"
        hint="Подойдите близко, поместите лицо в круг и не двигайтесь."
        onClose={() => setFaceCaptureOpen(false)}
        onCapture={handleFaceCaptureLogin}
      />
    </div>
  );
};

export default LoginPage;
