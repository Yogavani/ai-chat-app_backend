function normalizeToHttps(value) {
  if (typeof value !== "string") {
    return value;
  }

  return value.replace(/^http:\/\//i, "https://");
}

function getPublicBaseUrl() {
  const configuredValue = String(process.env.PUBLIC_BASE_URL || "").trim();
  const normalized = normalizeToHttps(configuredValue).replace(/\/+$/, "");

  if (normalized) {
    return normalized;
  }

  const host = process.env.HOST || "localhost";
  const port = process.env.PORT || 5000;
  return `https://${host}:${port}`;
}

function buildPublicMediaUrl(relativePath) {
  const baseUrl = getPublicBaseUrl();
  const normalizedPath = `/${String(relativePath || "").replace(/^\/+/, "")}`;
  return normalizeToHttps(`${baseUrl}${normalizedPath}`);
}

function normalizeMediaUrlForWrite(value) {
  const rawValue = typeof value === "string" ? value.trim() : "";
  if (!rawValue) {
    return "";
  }

  if (rawValue.startsWith("/") || rawValue.startsWith("uploads/")) {
    return buildPublicMediaUrl(rawValue);
  }

  const normalized = normalizeToHttps(rawValue);

  // Hard guard: if a protocol is present, only HTTPS is allowed.
  if (/^[a-z]+:\/\//i.test(normalized) && !/^https:\/\//i.test(normalized)) {
    throw { message: "Only HTTPS media URLs are allowed", statusCode: 400 };
  }

  return normalized;
}

function toPublicHttpsUrl(value) {
  const rawValue = typeof value === "string" ? value.trim() : "";
  if (!rawValue) {
    return value;
  }

  if (rawValue.startsWith("/") || rawValue.startsWith("uploads/")) {
    return buildPublicMediaUrl(rawValue);
  }

  if (/^http:\/\//i.test(rawValue)) {
    return normalizeToHttps(rawValue);
  }

  return rawValue;
}

function normalizeUserMediaFields(user) {
  if (!user || typeof user !== "object") {
    return user;
  }

  const normalizedUser = { ...user };
  const resolvedAvatar =
    typeof normalizedUser.avatar === "string" && normalizedUser.avatar.trim()
      ? toPublicHttpsUrl(normalizedUser.avatar)
      : null;
  const resolvedProfileImage =
    typeof normalizedUser.profileImage === "string" && normalizedUser.profileImage.trim()
      ? toPublicHttpsUrl(normalizedUser.profileImage)
      : null;
  const resolvedImageUrl =
    typeof normalizedUser.imageUrl === "string" && normalizedUser.imageUrl.trim()
      ? toPublicHttpsUrl(normalizedUser.imageUrl)
      : null;
  const canonicalImage = resolvedAvatar || resolvedProfileImage || resolvedImageUrl || null;

  if (typeof normalizedUser.avatar === "string" && normalizedUser.avatar.trim()) {
    normalizedUser.avatar = resolvedAvatar;
  }
  if (typeof normalizedUser.profileImage === "string" && normalizedUser.profileImage.trim()) {
    normalizedUser.profileImage = resolvedProfileImage;
  }
  if (typeof normalizedUser.imageUrl === "string" && normalizedUser.imageUrl.trim()) {
    normalizedUser.imageUrl = resolvedImageUrl;
  }
  if (typeof normalizedUser.media_url === "string" && normalizedUser.media_url.trim()) {
    normalizedUser.media_url = toPublicHttpsUrl(normalizedUser.media_url);
  }
  if (typeof normalizedUser.mediaUrl === "string" && normalizedUser.mediaUrl.trim()) {
    normalizedUser.mediaUrl = toPublicHttpsUrl(normalizedUser.mediaUrl);
  }

  // Keep backward compatibility across frontend fields.
  if (canonicalImage) {
    normalizedUser.avatar = canonicalImage;
    normalizedUser.profileImage = canonicalImage;
    normalizedUser.imageUrl = canonicalImage;
  }

  return normalizedUser;
}

module.exports = {
  normalizeToHttps,
  getPublicBaseUrl,
  buildPublicMediaUrl,
  normalizeMediaUrlForWrite,
  normalizeUserMediaFields,
  toPublicHttpsUrl
};
