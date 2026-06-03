import { redirect } from "next/navigation";

/** Legacy 封存：原始實作見 legacy-admin/main-data-page.tsx */
export default function AdminRootRedirectPage() {
  redirect("/admin/home");
}
