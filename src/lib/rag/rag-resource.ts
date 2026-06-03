/** 從 Discovery Engine 資源路徑解析 GCP project（數字或字串 ID） */
export function projectIdFromResource(resource: string): string | null {
  const m = resource.match(/\/projects\/([^/]+)\//);
  return m?.[1]?.trim() || null;
}

export function dataStoreIdFromResource(resource: string): string | null {
  const m = resource.match(/\/dataStores\/([^/]+)/);
  return m?.[1]?.trim() || null;
}

export function isEngineResource(resource: string): boolean {
  return resource.includes("/engines/");
}

export function discoveryApiHost(location: string): string {
  const loc = location.trim() || "global";
  return loc === "global"
    ? "https://discoveryengine.googleapis.com"
    : `https://${loc}-discoveryengine.googleapis.com`;
}
