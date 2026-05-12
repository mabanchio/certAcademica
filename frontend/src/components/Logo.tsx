// SVG del logo: escudo académico con cadena (blockchain)
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="CertAcadémica Logo"
    >
      {/* Escudo */}
      <path
        d="M32 4L8 14v18c0 13 10.5 22 24 26 13.5-4 24-13 24-26V14L32 4Z"
        fill="#2D9CDB"
        stroke="#fff"
        strokeWidth="2"
      />
      {/* Birrete */}
      <path d="M32 20l14 6-14 6-14-6 14-6Z" fill="#fff" />
      <path d="M46 26v8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      {/* Eslabón cadena */}
      <rect x="22" y="36" width="6" height="4" rx="2" fill="#fff" opacity="0.8" />
      <rect x="29" y="36" width="6" height="4" rx="2" fill="#fff" opacity="0.8" />
      <rect x="36" y="36" width="6" height="4" rx="2" fill="#fff" opacity="0.8" />
    </svg>
  );
}

// Favicon simplificado (solo escudo)
export function Favicon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M16 2L4 7v9c0 6.5 5.25 11 12 13 6.75-2 12-6.5 12-13V7L16 2Z"
        fill="#2D9CDB"
      />
      <path d="M16 10l7 3-7 3-7-3 7-3Z" fill="#fff" />
    </svg>
  );
}
