export const ADMIN_EMAIL = "carlosmelo0603n2@gmail.com";

export function isAllowedAdminEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() === ADMIN_EMAIL;
}
