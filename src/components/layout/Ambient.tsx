/**
 * The fixed radial blooms the glass floats above. These are what the
 * backdrop-filter actually blurs — without them the glass reads as flat
 * white, so they carry more color than you'd expect.
 */
export function Ambient() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed -left-[100px] -top-[160px] size-[560px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgb(10 102 194 / 0.16), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed left-[38%] top-[30%] size-[640px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgb(120 160 215 / 0.13), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-[180px] -right-[60px] size-[520px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgb(140 170 215 / 0.22), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed right-[18%] -top-[80px] size-[380px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgb(10 102 194 / 0.08), transparent 70%)",
        }}
      />
    </>
  );
}
