export default function Background() {
  return (
    <div
      aria-hidden
      className="noise pointer-events-none fixed inset-0 overflow-hidden"
    >
      <div className="absolute inset-0 bg-ink-900" />

      {/* ambient color orbs */}
      <div className="orb absolute -top-44 -right-40 h-[34rem] w-[34rem] rounded-full bg-gold-500/[0.13] blur-[130px]" />
      <div
        className="orb absolute top-1/3 -left-56 h-[30rem] w-[30rem] rounded-full bg-ember-500/[0.11] blur-[140px]"
        style={{ animationDelay: "-9s" }}
      />
      <div
        className="orb absolute -bottom-60 right-1/4 h-[36rem] w-[36rem] rounded-full bg-teal-400/[0.08] blur-[150px]"
        style={{ animationDelay: "-17s" }}
      />

      {/* faint top glow + vignette */}
      <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-white/[0.035] to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_10%,transparent_55%,rgba(4,6,10,0.85)_100%)]" />
    </div>
  );
}
