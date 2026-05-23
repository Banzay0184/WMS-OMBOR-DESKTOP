const base64UrlToBuffer = (base64url) => {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) {
    view[i] = raw.charCodeAt(i);
  }
  return buffer;
};

const bufferToBase64Url = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

export const isWebAuthnSupported = () =>
  typeof window !== "undefined" &&
  window.PublicKeyCredential != null &&
  typeof window.PublicKeyCredential === "function";

/** Face ID / встроенная биометрия устройства (Secure Enclave). */
export const isFaceIdAvailable = async () => {
  if (!isWebAuthnSupported()) return false;
  const check = window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable;
  if (typeof check !== "function") return true;
  try {
    return await check.call(window.PublicKeyCredential);
  } catch {
    return false;
  }
};

export const parseCreationOptions = (options) => ({
  ...options,
  challenge: base64UrlToBuffer(options.challenge),
  user: {
    ...options.user,
    id: base64UrlToBuffer(options.user.id),
  },
  excludeCredentials: (options.excludeCredentials || []).map((cred) => ({
    ...cred,
    id: base64UrlToBuffer(cred.id),
  })),
});

export const parseRequestOptions = (options) => ({
  ...options,
  challenge: base64UrlToBuffer(options.challenge),
  allowCredentials: (options.allowCredentials || []).map((cred) => ({
    ...cred,
    id: base64UrlToBuffer(cred.id),
  })),
});

export const credentialToJSON = (credential) => {
  const response = credential.response;
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      attestationObject: response.attestationObject
        ? bufferToBase64Url(response.attestationObject)
        : undefined,
      authenticatorData: response.authenticatorData
        ? bufferToBase64Url(response.authenticatorData)
        : undefined,
      signature: response.signature ? bufferToBase64Url(response.signature) : undefined,
      userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : undefined,
    },
  };
};

export const registerPasskey = async (options) => {
  const publicKey = parseCreationOptions(options);
  const credential = await navigator.credentials.create({ publicKey });
  if (!credential) {
    throw new Error("Регистрация Face ID отменена.");
  }
  return credentialToJSON(credential);
};

export const authenticatePasskey = async (options) => {
  const publicKey = parseRequestOptions(options);
  const credential = await navigator.credentials.get({ publicKey });
  if (!credential) {
    throw new Error("Вход по Face ID отменён.");
  }
  return credentialToJSON(credential);
};
