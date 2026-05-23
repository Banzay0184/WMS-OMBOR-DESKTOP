const CACHE_TTL_MS = 60_000;
const cache = new Map();

export const getCachedDashboardSummary = (organizationId) => {
  const key = String(organizationId);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
};

export const setCachedDashboardSummary = (organizationId, data) => {
  cache.set(String(organizationId), { data, at: Date.now() });
};

export const invalidateDashboardSummary = (organizationId) => {
  if (organizationId != null) {
    cache.delete(String(organizationId));
    return;
  }
  cache.clear();
};
