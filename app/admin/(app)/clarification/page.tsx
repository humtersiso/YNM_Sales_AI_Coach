import { redirect } from "next/navigation";

/** Legacy 封存：原始實作見 legacy-admin/clarification-page.tsx */
export default function ClarificationRedirectPage() {
  redirect("/admin/home");
}
