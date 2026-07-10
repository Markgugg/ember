/** The two fixed radial blooms the glass floats above. Decorative, inert. */
export function Ambient() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed -left-[100px] -top-[160px] size-[560px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgb(10 102 194 / 0.09), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-[180px] -right-[60px] size-[520px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgb(140 170 215 / 0.14), transparent 70%)",
        }}
      />
    </>
  );
}
