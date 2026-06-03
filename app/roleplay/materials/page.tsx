"use client";

import { useState } from "react";
import { PortalLayout } from "@/components/mobile/PortalLayout";
import { RoleplayMaterialsBrowser } from "@/components/roleplay/RoleplayMaterialsBrowser";
import { RoleplayScenariosBrowser } from "@/components/roleplay/RoleplayScenariosBrowser";

type Tab = "scenarios" | "sales";

export default function RoleplayMaterialsPage() {
  const [tab, setTab] = useState<Tab>("scenarios");

  return (
    <PortalLayout
      title="對練素材區"
      subtitle="情境劇本與話術參考"
      backHref="/roleplay"
    >
      <div className="mb-4 flex rounded-xl border border-emerald-100 bg-white p-1">
        <button
          type="button"
          onClick={() => setTab("scenarios")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${
            tab === "scenarios"
              ? "bg-teal-600 text-white"
              : "text-emerald-700 hover:bg-emerald-50"
          }`}
        >
          情境劇本
        </button>
        <button
          type="button"
          onClick={() => setTab("sales")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${
            tab === "sales"
              ? "bg-teal-600 text-white"
              : "text-emerald-700 hover:bg-emerald-50"
          }`}
        >
          銷售話術參考
        </button>
      </div>

      {tab === "scenarios" ? (
        <>
          <p className="mb-3 text-sm leading-relaxed text-emerald-800">
            依知識庫建置文件 Section A～F 結構呈現（目前為示範 seed，待 KB-T33 匯入後更新）。
          </p>
          <RoleplayScenariosBrowser />
        </>
      ) : (
        <>
          <p className="mb-3 text-sm leading-relaxed text-emerald-800">
            來自銷售助手 BigQuery 話術庫，供對練前參考，非對練評分題庫。
          </p>
          <RoleplayMaterialsBrowser />
        </>
      )}
    </PortalLayout>
  );
}
