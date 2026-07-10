import { notFound } from "next/navigation";
import { getRepo } from "@/lib/db";
import { getUserId } from "@/lib/identity";
import { BriefView, type BriefViewData } from "@/components/brief/BriefView";
import { RefusalView } from "@/components/brief/RefusalView";

export const dynamic = "force-dynamic";

export default async function BriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = await getRepo();
  const userId = await getUserId();
  const bundle = await repo.getBriefBundle(id, userId);
  if (!bundle) notFound();

  if (bundle.brief.status === "refused" && bundle.brief.refusal) {
    return <RefusalView refusal={bundle.brief.refusal} />;
  }

  const profile = await repo.getProfile(userId);
  const { linkedinReady } = await import("@/lib/linkedin");

  // Strip embeddings before crossing to the client — 1536 floats of dead weight.
  const data: BriefViewData = {
    briefId: bundle.brief.id,
    rationale: bundle.brief.intersectionRationale,
    recommendation: bundle.brief.recommendation,
    insightQuote: bundle.insight?.quote ?? null,
    author: {
      name: profile?.displayName ?? "You",
      headline: profile?.headline ?? null,
    },
    linkedinConnected: linkedinReady(profile),
    discourse: bundle.discourseItem
      ? {
          title: bundle.discourseItem.title,
          sources: bundle.discourseItem.sources,
        }
      : null,
    drafts: bundle.drafts.map((d) => ({
      id: d.id,
      angle: d.angle,
      rationale: d.rationale,
      body: d.body,
      isPrimary: d.isPrimary,
      status: d.status,
    })),
  };

  return <BriefView data={data} />;
}
