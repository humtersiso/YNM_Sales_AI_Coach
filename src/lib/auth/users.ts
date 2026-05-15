export type AppUser = {
  username: string;
  password: string;
  displayName: string;
};

function parseFromEnv(): AppUser[] {
  const raw = process.env.APP_USERS_JSON?.trim();
  if (!raw) return [];
  try {
    const rows = JSON.parse(raw) as AppUser[];
    return rows.filter((x) => x.username && x.password);
  } catch {
    return [];
  }
}

export const USERS: AppUser[] = parseFromEnv().length
  ? parseFromEnv()
  : [{ username: "YLG_001", password: "1111", displayName: "YLG_001" }];

export function findUser(username: string, password: string): AppUser | null {
  return USERS.find((u) => u.username === username && u.password === password) ?? null;
}

