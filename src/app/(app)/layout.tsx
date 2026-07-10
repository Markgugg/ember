import { Suspense } from "react";
import { getRepo } from "@/lib/db";
import { getUserId } from "@/lib/identity";
import { Ambient } from "@/components/layout/Ambient";
import { FloatingNav } from "@/components/layout/FloatingNav";
import { ComposerSheet } from "@/components/composer/ComposerSheet";
import { SettingsModal } from "@/components/settings/SettingsModal";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const repo = await getRepo();
  const profile = await repo.getProfile(await getUserId());
  const initials = toInitials(profile?.displayName);

  return (
    <div className="relative min-h-screen overflow-x-hidden text-ink">
      <Ambient />
      <Suspense fallback={null}>
        <FloatingNav initials={initials} />
      </Suspense>
      {children}
      <Suspense fallback={null}>
        <ComposerSheet />
      </Suspense>
      <SettingsModal />
    </div>
  );
}

function toInitials(name: string | null | undefined): string {
  if (!name) return "YOU";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "YOU";
}
