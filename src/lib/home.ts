export function homePath(user?: { role_slug?: string } | null) {
  return user?.role_slug === "delivery" ? "/courier" : "/";
}
