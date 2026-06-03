import { redirect } from "next/navigation";

/** Legacy 封存：原始實作見 legacy-admin/experts-page.tsx */
export default function ExpertsRedirectPage() {
  redirect("/admin/home");
}
