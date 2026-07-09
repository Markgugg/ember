import type { HTMLAttributes } from "react";

/** Level-1 surface: raised background + subtle border. Elevation by border, not shadow. */
export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-line bg-raised ${className}`}
      {...props}
    />
  );
}
