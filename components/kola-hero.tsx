export default function KolaHero() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[30rem]">
      {/* orbit rings */}
      <div className="absolute inset-0 rounded-full border border-cyan-400/10" />
      <div className="absolute inset-[8%] rounded-full border border-dashed border-cyan-400/15 animate-orbit" />
      <div className="absolute inset-[18%] rounded-full border border-cyan-500/20 blur-[2px]" />
      <div className="absolute inset-0 rounded-full bg-cyan-500/10 blur-3xl" />

      {/* scanning line */}
      <div className="absolute inset-[18%] overflow-hidden rounded-full">
        <div className="h-full w-full animate-scan bg-gradient-to-b from-transparent via-cyan-300/20 to-transparent" />
      </div>

      <svg
        viewBox="0 0 400 400"
        role="img"
        aria-label="KOLA AI assistant"
        className="animate-float relative h-full w-full"
      >
        <defs>
          <linearGradient id="kolaShell" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f8fbff" />
            <stop offset="100%" stopColor="#b9d3ea" />
          </linearGradient>
          <linearGradient id="kolaVisor" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0b2a45" />
            <stop offset="100%" stopColor="#04101c" />
          </linearGradient>
          <linearGradient id="kolaGlow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>
          <filter id="kolaBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* halo */}
        <circle cx="200" cy="205" r="120" fill="#22d3ee" opacity="0.18" filter="url(#kolaBlur)" />

        {/* antenna */}
        <path d="M200 78v-26" stroke="url(#kolaGlow)" strokeWidth="5" strokeLinecap="round" />
        <circle cx="200" cy="44" r="11" fill="#22d3ee" />
        <circle cx="200" cy="44" r="20" fill="#22d3ee" opacity="0.35" />

        {/* ears */}
        <rect x="46" y="168" width="26" height="66" rx="12" fill="url(#kolaShell)" />
        <rect x="328" y="168" width="26" height="66" rx="12" fill="url(#kolaShell)" />

        {/* head shell */}
        <path
          d="M200 96c62 0 104 38 110 92 4 36-4 66-22 88-16 20-44 32-88 32s-72-12-88-32c-18-22-26-52-22-88 6-54 48-92 110-92z"
          fill="url(#kolaShell)"
        />
        <path
          d="M200 96c62 0 104 38 110 92 4 36-4 66-22 88-16 20-44 32-88 32"
          fill="none"
          stroke="#8fb4d4"
          strokeWidth="2"
          opacity="0.7"
        />

        {/* visor */}
        <rect x="96" y="150" width="208" height="92" rx="44" fill="url(#kolaVisor)" />

        {/* eyes */}
        <ellipse cx="152" cy="196" rx="26" ry="18" fill="#22d3ee" opacity="0.5" filter="url(#kolaBlur)" />
        <ellipse cx="248" cy="196" rx="26" ry="18" fill="#22d3ee" opacity="0.5" filter="url(#kolaBlur)" />
        <ellipse cx="152" cy="196" rx="18" ry="11" fill="#67e8f9" />
        <ellipse cx="248" cy="196" rx="18" ry="11" fill="#67e8f9" />
        <ellipse cx="148" cy="192" rx="6" ry="4" fill="#ffffff" opacity="0.9" />
        <ellipse cx="244" cy="192" rx="6" ry="4" fill="#ffffff" opacity="0.9" />

        {/* mouth grille */}
        <rect x="176" y="258" width="48" height="7" rx="3.5" fill="#0b2a45" opacity="0.85" />

        {/* cheeks */}
        <circle cx="118" cy="264" r="7" fill="#22d3ee" opacity="0.75" />
        <circle cx="282" cy="264" r="7" fill="#22d3ee" opacity="0.75" />

        {/* neck + shoulders */}
        <rect x="182" y="310" width="36" height="28" rx="10" fill="#9fc0da" />
        <path d="M120 372c6-26 40-38 80-38s74 12 80 38z" fill="url(#kolaShell)" />
        <rect x="182" y="344" width="36" height="9" rx="4.5" fill="#22d3ee" />
      </svg>
    </div>
  );
}
