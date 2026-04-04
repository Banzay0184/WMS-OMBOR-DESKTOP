import { useState, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { authFetch } from "../../api/client";
import { getImageUrl } from "../../config";
import { formatPhoneDisplay, getPhoneDigits, PHONE_PLACEHOLDER } from "../../utils/phone";

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

const getInitials = (username) => {
  if (!username || typeof username !== "string") return "—";
  const parts = username.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return username.slice(0, 2).toUpperCase();
};

const AdminSettings = () => {
  const { user, updateUser } = useAuth();

  const [profileUsername, setProfileUsername] = useState(user?.username ?? "");
  const [profilePhone, setProfilePhone] = useState(() => formatPhoneDisplay(user?.phone ?? ""));
  const [profileImageFile, setProfileImageFile] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState(getImageUrl(user?.image) ?? null);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewPasswordConfirm, setShowNewPasswordConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleProfilePhoneChange = useCallback((e) => {
    setProfilePhone(formatPhoneDisplay(e.target.value));
  }, []);

  const handleProfileImageChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setProfileImagePreview(reader.result);
    reader.readAsDataURL(file);
  }, []);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");
    setProfileLoading(true);
    try {
      const formData = new FormData();
      formData.append("username", profileUsername.trim());
      const phoneDigits = getPhoneDigits(profilePhone);
      formData.append("phone", phoneDigits || profilePhone.trim());
      if (profileImageFile) formData.append("image", profileImageFile);

      const response = await authFetch("me/", {
        method: "PATCH",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data.username?.[0] ?? data.phone?.[0] ?? data.detail ?? data.image?.[0] ?? "Ошибка сохранения";
        setProfileError(Array.isArray(message) ? message[0] : message);
        setProfileLoading(false);
        return;
      }

      updateUser({
        username: data.username,
        phone: data.phone ?? user?.phone ?? null,
        image: data.image ?? user?.image ?? null,
      });
      setProfilePhone(formatPhoneDisplay(data.phone ?? user?.phone ?? ""));
      setProfileImageFile(null);
      setProfileSuccess("Данные сохранены.");
    } catch (err) {
      setProfileError(err.message ?? "Ошибка сети");
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (newPassword !== newPasswordConfirm) {
      setPasswordError("Новый пароль и подтверждение не совпадают.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Новый пароль не менее 8 символов.");
      return;
    }
    setPasswordLoading(true);
    try {
      const response = await authFetch("me/change_password/", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setPasswordError(data.current_password?.[0] ?? data.new_password?.[0] ?? data.detail ?? "Ошибка смены пароля");
        setPasswordLoading(false);
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setPasswordSuccess("Пароль успешно изменён.");
    } catch (err) {
      setPasswordError(err.message ?? "Ошибка сети");
    } finally {
      setPasswordLoading(false);
    }
  };

  const avatarUrl = profileImagePreview || getImageUrl(user?.image);
  const initials = getInitials(profileUsername || user?.username);

  const inputClassName =
    "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-muted placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition";
  const inputWithEyeClassName = inputClassName + " pr-11";
  const labelClassName = "block text-sm font-medium text-muted mb-1.5";

  return (
    <div className="max-w-2xl space-y-8 sm:space-y-10">
      <h1 className="text-2xl font-semibold text-muted">Настройки</h1>

      <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-medium text-muted mb-2">Учётная запись</h2>
        <p className="text-sm text-muted mb-5">Имя, телефон и фото профиля.</p>

        <form onSubmit={handleProfileSubmit} className="space-y-6">
          <div className="flex items-center gap-6">
            <div
              className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center text-muted font-semibold text-xl shrink-0 overflow-hidden"
              aria-hidden="true"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="flex-1 min-w-0">
              <label htmlFor="profile-image" className={labelClassName}>
                Фото
              </label>
              <input
                id="profile-image"
                type="file"
                accept="image/*"
                onChange={handleProfileImageChange}
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
              value={profileUsername}
              onChange={(e) => setProfileUsername(e.target.value)}
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
              value={profilePhone}
              onChange={handleProfilePhoneChange}
              className={inputClassName}
              placeholder={PHONE_PLACEHOLDER}
              autoComplete="tel"
            />
          </div>

          {profileError ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
              {profileError}
            </p>
          ) : null}
          {profileSuccess ? (
            <p className="text-sm text-green-600" role="status">
              {profileSuccess}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={profileLoading}
            className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none transition"
          >
            {profileLoading ? "Сохранение…" : "Сохранить"}
          </button>
        </form>
      </section>

      <section className="bg-white rounded-xl border border-border p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-medium text-muted mb-2">Смена пароля</h2>
        <p className="text-sm text-muted mb-5">Введите текущий пароль и новый пароль (не менее 8 символов).</p>

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
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
                {showCurrentPassword ? (
                  <EyeOffIcon className="w-5 h-5" />
                ) : (
                  <EyeIcon className="w-5 h-5" />
                )}
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
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-muted hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
                  aria-label={showNewPassword ? "Скрыть пароль" : "Показать пароль"}
                tabIndex={0}
              >
                {showNewPassword ? (
                  <EyeOffIcon className="w-5 h-5" />
                ) : (
                  <EyeIcon className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="new-password-confirm" className={labelClassName}>
              Подтверждение нового пароля
            </label>
            <div className="relative">
              <input
                id="new-password-confirm"
                type={showNewPasswordConfirm ? "text" : "password"}
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                className={inputWithEyeClassName}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPasswordConfirm((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-muted hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
                  aria-label={showNewPasswordConfirm ? "Скрыть пароль" : "Показать пароль"}
                tabIndex={0}
              >
                {showNewPasswordConfirm ? (
                  <EyeOffIcon className="w-5 h-5" />
                ) : (
                  <EyeIcon className="w-5 h-5" />
                )}
              </button>
            </div>
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

export default AdminSettings;
