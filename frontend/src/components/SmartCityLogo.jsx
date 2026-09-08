// Professional Smart City brand mark: a stylised city skyline made of
// buildings whose windows resolve into a connected node/circuit pattern,
// communicating "civic infrastructure" + "digital/AI technology" in one
// clean glyph. Pure SVG using currentColor + CSS custom properties so it
// renders correctly on both light and dark backgrounds without needing
// separate light/dark asset files.
function SmartCityLogo({ size = 40, className = "", title = "Smart City" }) {
  return (
    <svg
      className={`smart-city-logo ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>

      {/* Skyline */}
      <rect x="6" y="30" width="9" height="26" rx="1.5" className="scl-building scl-b1" />
      <rect x="17" y="20" width="9" height="36" rx="1.5" className="scl-building scl-b2" />
      <rect x="28" y="8" width="10" height="48" rx="1.5" className="scl-building scl-b3" />
      <rect x="40" y="24" width="9" height="32" rx="1.5" className="scl-building scl-b2" />
      <rect x="51" y="34" width="8" height="22" rx="1.5" className="scl-building scl-b1" />

      {/* Windows-as-nodes, connected by thin lines to read as a smart/AI
          network layered over the skyline. */}
      <g className="scl-network" strokeWidth="1.4" fill="none">
        <path d="M10 38 L21 30 L33 18 L44 32 L55 40" />
      </g>
      <g className="scl-nodes">
        <circle cx="10" cy="38" r="2.2" />
        <circle cx="21" cy="30" r="2.2" />
        <circle cx="33" cy="18" r="2.6" />
        <circle cx="44" cy="32" r="2.2" />
        <circle cx="55" cy="40" r="2.2" />
      </g>

      {/* Ground line */}
      <rect x="4" y="56" width="56" height="2.5" rx="1.25" className="scl-ground" />
    </svg>
  );
}

export default SmartCityLogo;
