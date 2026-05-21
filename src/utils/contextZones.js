/** Доступные зоны организации: app (склад) и/или pos (касса). */
export const zonesForOrganization = (org) => {
  if (Array.isArray(org?.available_zones) && org.available_zones.length > 0) {
    return org.available_zones;
  }
  if (org?.has_pos) return ["app", "pos"];
  return ["app"];
};

/** Сколько «дверей» входа у пользователя (платформа + зоны по каждой org). */
export const countContextDoors = (contexts) => {
  const platform = Boolean(contexts?.platform);
  const organizations = Array.isArray(contexts?.organizations) ? contexts.organizations : [];
  return (
    (platform ? 1 : 0) +
    organizations.reduce((sum, org) => sum + zonesForOrganization(org).length, 0)
  );
};

/**
 * Если у пользователя ровно одна «дверь» — куда направить после логина.
 * Иначе null (нужен экран выбора).
 */
export const resolveSingleContextTarget = (contexts) => {
  if (countContextDoors(contexts) !== 1) return null;

  if (contexts?.platform) {
    return { type: "platform", path: "/panel" };
  }

  const org = contexts?.organizations?.[0];
  if (!org) return null;

  const zones = zonesForOrganization(org);
  if (zones[0] === "pos") {
    return { type: "pos", organizationId: org.id, path: "/pos" };
  }

  return { type: "organization", organizationId: org.id, path: "/app" };
};

/** Есть ли у пользователя выбор между несколькими зонами/компаниями. */
export const hasMultipleContextDoors = (contexts) => countContextDoors(contexts) > 1;
