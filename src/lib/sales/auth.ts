export const SALES_LOGIN_PASSWORD = "1234";

export function isValidSalesPassword(password: string): boolean {
  return password === SALES_LOGIN_PASSWORD;
}
