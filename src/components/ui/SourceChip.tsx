import { ExternalLink } from "lucide-react";

export interface SourceChipProps {
  url: string;
  domain: string;
  /** Human age string, e.g. "6h ago". */
  age?: string;
  meta?: string;
}

/** Provenance chip — favicon + domain + age, links out. One tap to the source, never in the way. */
export function SourceChip({ url, domain, age, meta }: SourceChipProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-1.5 rounded-sm border border-line bg-raised px-2 py-0.5 text-xs text-ink-2 transition-colors duration-[120ms] hover:border-line-strong hover:text-ink"
    >
      {/* google favicon service keeps this dependency-free; alt empty — decorative */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`}
        alt=""
        width={12}
        height={12}
        className="rounded-[2px]"
      />
      <span>{domain}</span>
      {age && <span className="text-ink-3">· {age}</span>}
      {meta && <span className="text-ink-3">· {meta}</span>}
      <ExternalLink
        size={11}
        className="opacity-0 transition-opacity duration-[120ms] group-hover:opacity-60"
        aria-hidden
      />
    </a>
  );
}
