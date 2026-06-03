import { redirect } from "next/navigation";

/** Legacy 封存：原始實作見 legacy-admin/inbox-page.tsx */
export default function InboxRedirectPage() {
  redirect("/admin/home");
}
