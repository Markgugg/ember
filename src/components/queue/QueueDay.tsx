"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { planDraft } from "@/app/actions";
import { useToast } from "@/components/ui/Toast";

export interface QueuePost {
  id: string;
  briefId: string;
  time: string;
  title: string;
  angle: string;
}

/** One column of the week. Planned posts sit here; the slot is a reminder. */
export function QueueDay({
  iso,
  label,
  date,
  isToday,
  posts,
}: {
  iso: string;
  label: string;
  date: string;
  isToday: boolean;
  posts: QueuePost[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const clear = (draftId: string) => {
    startTransition(async () => {
      await planDraft(draftId, null);
      toast({ message: "Slot cleared." });
      router.refresh();
    });
  };

  return (
    <div className="glass-soft flex min-h-[220px] flex-col gap-2 rounded-[18px] px-2.5 py-3">
      <div className="border-b border-[rgb(27_36_48/0.07)] pb-2 text-center">
        <div
          className={`text-[10px] font-bold tracking-[0.08em] ${
            isToday ? "text-accent" : "text-ink-3"
          }`}
        >
          {label}
        </div>
        <div
          className={`mt-px text-[19px] font-bold ${
            isToday ? "text-accent" : "text-ink"
          }`}
        >
          {date}
        </div>
      </div>

      {posts.map((p) => (
        <div
          key={p.id}
          className="rounded-xl border border-[rgb(27_36_48/0.06)] bg-[rgb(255_255_255/0.75)] px-2.5 py-2.5 transition-transform duration-200 hover:scale-[1.03] hover:shadow-[0_8px_18px_rgb(31_45_65/0.12)]"
        >
          <Link href={`/brief/${p.briefId}`} className="block">
            <div className="text-[9.5px] font-bold text-accent">{p.time}</div>
            <div className="mt-0.5 line-clamp-2 text-[11.5px] font-semibold leading-[1.35]">
              {p.title}
            </div>
            <div className="mt-1 text-[9.5px] capitalize text-ink-4">
              {p.angle}
            </div>
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={() => clear(p.id)}
            className="mt-1.5 text-[9.5px] font-semibold text-ink-4 hover:text-danger"
          >
            clear slot
          </button>
        </div>
      ))}

      <div className="flex-1" />

      <Link
        href={`/queue?compose=news&slot=${encodeURIComponent(iso)}`}
        scroll={false}
        className="flex items-center justify-center rounded-[11px] border-[1.5px] border-dashed border-[rgb(27_36_48/0.14)] py-2 text-[11px] font-semibold text-ink-4 transition-colors hover:bg-[rgb(255_255_255/0.55)] hover:text-accent"
      >
        +
      </Link>
    </div>
  );
}
