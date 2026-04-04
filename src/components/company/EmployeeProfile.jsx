import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { getImageUrl } from "../../config";
import { formatPhoneDisplay, getPhoneDigits, PHONE_PLACEHOLDER } from "../../utils/phone";

const EyeIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
    />
  </svg>
);

const EyeOffIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
    />
  </svg>
);

const getInitials = (username) => {
  if (!username || typeof username !== "string") return "—";
  const parts = username.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return username.slice(0, 2).toUpperCase();
};

const EmployeeProfile = () => {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [imageUrl, setImageUrl] = useState(null);
  const [imageFile, setImageFile] = useState(null);

  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    let alive = true;
    const loadMe = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const res = await authFetch("me/");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!alive) return;
          setLoadError(data.detail ?? "Ошибка загрузки профиля.");
          return;
        }
        if (!alive) return;
        setUsername(data.username ?? "");
        setPhone(formatPhoneDisplay(data.phone ?? ""));
        setImageUrl(typeof data.image === "string" ? data.image : null);
        updateUser?.(data);
      } catch (err) {
        if (!alive) return;
        setLoadError(err.message ?? "Ошибка сети");
      } finally {
        if (alive) setLoading(false);
      }
    };
    loadMe();
    return () => {
      alive = false;
    };
  }, [updateUser]);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setImageUrl(preview);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaveError("");
    setSaveSuccess("");
    setSaveLoading(true);
    try {
      const formData = new FormData();
      const nameValue = username.trim();
      const phoneDigits = getPhoneDigits(phone) || phone.trim();

      if (nameValue) formData.append("username", nameValue);
      if (phoneDigits) formData.append("phone", phoneDigits);
      if (imageFile) formData.append("image", imageFile);

      const res = await authFetch("me/", { method: "PATCH", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.username?.[0] ?? data.phone?.[0] ?? data.detail ?? "Ошибка сохранения");
        return;
      }

      setUsername(data.username ?? "");
      setPhone(formatPhoneDisplay(data.phone ?? ""));
      setImageUrl(typeof data.image === "string" ? data.image : imageUrl);
      setImageFile(null);
      updateUser?.(data);
      setSaveSuccess("Профиль обновлён.");
      setTimeout(() => setSaveSuccess(""), 3000);
    } catch (err) {
      setSaveError(err.message ?? "Ошибка сети");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    const currentValue = currentPassword;
    const nextValue = newPassword;
    if (nextValue !== newPasswordConfirm) {
      setPasswordError("Новый пароль и подтверждение не совпадают.");
      return;
    }
    if (!currentValue || !nextValue) {
      setPasswordError("Заполните текущий и новый пароль.");
      return;
    }
    if (String(nextValue).length < 8) {
      setPasswordError("Новый пароль должен быть минимум 8 символов.");
      return;
    }
    setPasswordLoading(true);
    try {
      const res = await authFetch("me/change_password/", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentValue,
          new_password: nextValue,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasswordError(data.current_password?.[0] ?? data.new_password?.[0] ?? data.detail ?? "Ошибка смены пароля");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setPasswordSuccess(data.detail ?? "Пароль изменён.");
      setTimeout(() => setPasswordSuccess(""), 3000);
    } catch (err) {
      setPasswordError(err.message ?? "Ошибка сети");
    } finally {
      setPasswordLoading(false);
    }
  };

  const inputClassName =
    "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition";
  const inputWithEyeClassName = inputClassName + " pr-11";
  const labelClassName = "block text-sm font-medium text-muted mb-1.5";

  const avatarUrl = imageUrl || getImageUrl(user?.image);
  const initials = getInitials(username || user?.username);

  if (loading) return <p className="text-muted">Загрузка…</p>;

  return (
    <div className="max-w-2xl space-y-8 sm:space-y-10">
      <h1 className="text-2xl font-semibold text-muted">Настройки</h1>

      {loadError ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
          {loadError}
        </p>
      ) : null}

      <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-medium text-muted mb-2">Учётная запись</h2>
        <p className="text-sm text-muted mb-5">Имя, телефон и фото профиля.</p>

        <form onSubmit={handleSaveProfile} className="space-y-6">
          <div className="flex items-center gap-6">
            <div
              className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center text-muted font-semibold text-xl shrink-0 overflow-hidden"
              aria-hidden="true"
            >
              {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : initials}
            </div>

            <div className="flex-1 min-w-0">
              <label htmlFor="profile-image" className={labelClassName}>
                Фото
              </label>
              <input
                id="profile-image"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="block w-full text-sm text-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-secondary file:text-muted hover:file:bg-primary hover:file:text-white"
                aria-label="Выберите изображение профиля"
              />
            </div>
          </div>

          <div>
            <label htmlFor="profile-username" className={labelClassName}>
              Имя пользователя
            </label>
            <input
              id="profile-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClassName}
              placeholder="Логин"
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="profile-phone" className={labelClassName}>
              Телефон
            </label>
            <input
              id="profile-phone"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(formatPhoneDisplay(e.target.value))}
              className={inputClassName}
              placeholder={PHONE_PLACEHOLDER}
              autoComplete="tel"
            />
          </div>

          {saveError ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
              {saveError}
            </p>
          ) : null}
          {saveSuccess ? (
            <p className="text-sm text-green-600" role="status">
              {saveSuccess}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saveLoading}
            className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none transition"
          >
            {saveLoading ? "Сохранение…" : "Сохранить"}
          </button>
        </form>
      </section>

      <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-medium text-muted mb-2">Смена пароля</h2>
        <p className="text-sm text-muted mb-5">Введите текущий пароль и новый пароль (не менее 8 символов).</p>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label htmlFor="current-password" className={labelClassName}>
              Текущий пароль
            </label>
            <div className="relative">
              <input
                id="current-password"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputWithEyeClassName}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-muted hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
                aria-label={showCurrentPassword ? "Скрыть пароль" : "Показать пароль"}
                tabIndex={0}
              >
                {showCurrentPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="new-password" className={labelClassName}>
              Новый пароль
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputWithEyeClassName}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-muted hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
                aria-label={showNewPassword ? "Скрыть пароль" : "Показать пароль"}
                tabIndex={0}
              >
                {showNewPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="new-password-confirm" className={labelClassName}>
              Повторите новый пароль
            </label>
            <input
              id="new-password-confirm"
              type="password"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              className={inputClassName}
              autoComplete="new-password"
              required
            />
          </div>

          {passwordError ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
              {passwordError}
            </p>
          ) : null}
          {passwordSuccess ? (
            <p className="text-sm text-green-600" role="status">
              {passwordSuccess}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={passwordLoading}
            className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none transition"
          >
            {passwordLoading ? "Сохранение…" : "Изменить пароль"}
          </button>
        </form>
      </section>
    </div>
  );
};

export default EmployeeProfile;
