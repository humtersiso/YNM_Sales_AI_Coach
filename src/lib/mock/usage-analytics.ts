export type AssistantType = "sales" | "roleplay";

export type QueryLog = {
  id: string;
  question: string;
  replySummary: string;
  fullReply: string;
  askedAt: string;
  branch: string;
  agentName: string;
  tenureYears: number;
  assistantType: AssistantType;
  isCompetitor?: boolean;
  competitorTags?: string[];
};

export type AgentLeaderboardRow = {
  id: string;
  name: string;
  branch: string;
  tenureYears: number;
  usageScore: number;
  performanceScore: number;
  compositeScore: number;
};

export type CompetitorTopQuestion = {
  question: string;
  count: number;
  sharePct: number;
  lastAskedAt: string;
  tags: string[];
};

const branches = ["台北一區", "新北二區", "桃園區", "台中區", "高雄區"];

export const mockQueryLogs: QueryLog[] = [
  {
    id: "q1",
    question: "KICKS 跟 HR-V 油耗怎麼比？",
    replySummary: "KICKS 市區油耗約 16km/L，HR-V 約 15km/L；可強調 KICKS 價格帶與配備…",
    fullReply:
      "KICKS 在市區工況約 16 km/L，HR-V 約 15 km/L。建議從價格帶、安全配備與保養成本切入，並邀請試乘體驗加速比較。",
    askedAt: "2026-05-14T10:22:00+08:00",
    branch: "台北一區",
    agentName: "王小明",
    tenureYears: 3,
    assistantType: "sales",
    isCompetitor: true,
    competitorTags: ["HR-V"],
  },
  {
    id: "q2",
    question: "Altis 空間比 Sentra 大多少？",
    replySummary: "後座膝部空間 Altis 多約 2–3 指寬；行李廂容積相近…",
    fullReply: "Altis 後座膝部空間約多 2–3 指寬，行李廂容積與 Sentra 相近，可引導客戶實際試坐。",
    askedAt: "2026-05-14T09:05:00+08:00",
    branch: "新北二區",
    agentName: "陳雅婷",
    tenureYears: 5,
    assistantType: "sales",
    isCompetitor: true,
    competitorTags: ["Altis", "Sentra"],
  },
  {
    id: "q3",
    question: "客戶說 KICKS 太貴怎麼回？",
    replySummary: "先認同預算，再拆每月付款與總持有成本…",
    fullReply: "先認同客戶預算考量，再以月付、保養與二手殘值說明總持有成本，最後提供試算表。",
    askedAt: "2026-05-13T16:40:00+08:00",
    branch: "桃園區",
    agentName: "林志豪",
    tenureYears: 2,
    assistantType: "sales",
  },
  {
    id: "q4",
    question: "HR-V 安全配備有哪些？",
    replySummary: "同級常見 ADAS 項目；可對照本公司車款標配…",
    fullReply: "HR-V 具備多項 ADAS，建議對照本公司同級車款標配清單，凸顯性價比與售後服務。",
    askedAt: "2026-05-13T14:11:00+08:00",
    branch: "台中區",
    agentName: "張美玲",
    tenureYears: 7,
    assistantType: "sales",
    isCompetitor: true,
    competitorTags: ["HR-V"],
  },
  {
    id: "q5",
    question: "對練：客戶堅持要試駕競品",
    replySummary: "（對練紀錄）引導回本品試乘流程…",
    fullReply: "示範話術：理解客戶需求後，安排本品深度試乘並準備競品對照表。",
    askedAt: "2026-05-12T11:30:00+08:00",
    branch: "高雄區",
    agentName: "黃俊賢",
    tenureYears: 4,
    assistantType: "roleplay",
  },
  {
    id: "q6",
    question: "RAV4 跟 X-Trail 怎麼選？",
    replySummary: "從四驅需求、油耗與保固比較…",
    fullReply: "依客戶四驅需求、油耗與保固年限比較，並連結本品優勢與試乘。",
    askedAt: "2026-05-12T09:18:00+08:00",
    branch: "台北一區",
    agentName: "王小明",
    tenureYears: 3,
    assistantType: "sales",
    isCompetitor: true,
    competitorTags: ["RAV4", "X-Trail"],
  },
  {
    id: "q7",
    question: "Sentra 促銷方案有哪些？",
    replySummary: "競品促銷僅供參考；轉回本品牌方案…",
    fullReply: "說明競品促銷僅供參考，轉介本公司當月金融與購車優惠。",
    askedAt: "2026-05-11T15:02:00+08:00",
    branch: "新北二區",
    agentName: "陳雅婷",
    tenureYears: 5,
    assistantType: "sales",
    isCompetitor: true,
    competitorTags: ["Sentra"],
  },
  {
    id: "q8",
    question: "KICKS 保固幾年？",
    replySummary: "新車保固 3 年或 10 萬公里…",
    fullReply: "新車保固為 3 年或 10 萬公里（以先到為準），可搭配延長保固方案。",
    askedAt: "2026-05-10T13:45:00+08:00",
    branch: "桃園區",
    agentName: "林志豪",
    tenureYears: 2,
    assistantType: "sales",
  },
];

export const mockLeaderboard: AgentLeaderboardRow[] = [
  { id: "a1", name: "陳雅婷", branch: "新北二區", tenureYears: 5, usageScore: 92, performanceScore: 88, compositeScore: 90 },
  { id: "a2", name: "王小明", branch: "台北一區", tenureYears: 3, usageScore: 85, performanceScore: 91, compositeScore: 88 },
  { id: "a3", name: "張美玲", branch: "台中區", tenureYears: 7, usageScore: 78, performanceScore: 94, compositeScore: 87 },
  { id: "a4", name: "黃俊賢", branch: "高雄區", tenureYears: 4, usageScore: 70, performanceScore: 82, compositeScore: 76 },
  { id: "a5", name: "林志豪", branch: "桃園區", tenureYears: 2, usageScore: 65, performanceScore: 75, compositeScore: 70 },
];

export function getBranches() {
  return branches;
}

export type UsageFilters = {
  branch?: string;
  tenureMin?: number;
  tenureMax?: number;
  assistantType?: AssistantType | "all";
  dateFrom?: string;
  dateTo?: string;
};

function inDateRange(iso: string, from?: string, to?: string) {
  const t = new Date(iso).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime() + 86400000) return false;
  return true;
}

export function filterQueryLogs(logs: QueryLog[], f: UsageFilters) {
  return logs.filter((row) => {
    if (f.branch && f.branch !== "all" && row.branch !== f.branch) return false;
    if (f.assistantType && f.assistantType !== "all" && row.assistantType !== f.assistantType) return false;
    if (f.tenureMin != null && row.tenureYears < f.tenureMin) return false;
    if (f.tenureMax != null && row.tenureYears > f.tenureMax) return false;
    if (!inDateRange(row.askedAt, f.dateFrom, f.dateTo)) return false;
    return true;
  });
}

export function computeUsageKpis(logs: QueryLog[]) {
  const agents = new Set(logs.map((l) => l.agentName));
  const count = logs.length;
  return {
    activeAgents: agents.size,
    totalQuestions: count,
    avgPerAgent: agents.size ? Math.round((count / agents.size) * 10) / 10 : 0,
  };
}

export function filterLeaderboard(rows: AgentLeaderboardRow[], branch?: string) {
  if (!branch || branch === "all") return [...rows].sort((a, b) => b.compositeScore - a.compositeScore);
  return rows.filter((r) => r.branch === branch).sort((a, b) => b.compositeScore - a.compositeScore);
}

export function computeTopCompetitorQuestions(logs: QueryLog[], limit = 10): CompetitorTopQuestion[] {
  const competitor = logs.filter((l) => l.isCompetitor);
  const total = competitor.length || 1;
  const map = new Map<string, { count: number; last: string; tags: Set<string> }>();
  for (const row of competitor) {
    const key = row.question.trim();
    const cur = map.get(key) ?? { count: 0, last: row.askedAt, tags: new Set<string>() };
    cur.count += 1;
    if (row.askedAt > cur.last) cur.last = row.askedAt;
    row.competitorTags?.forEach((t) => cur.tags.add(t));
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([question, v]) => ({
      question,
      count: v.count,
      sharePct: Math.round((v.count / total) * 1000) / 10,
      lastAskedAt: v.last,
      tags: [...v.tags],
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
