import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { readSession } from "@/lib/auth/session";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSession();
  if (!session) {
    redirect("/login");
  }
  return <AppShell displayName={session.displayName}>{children}</AppShell>;
}
