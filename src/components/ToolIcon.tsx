const paths = {
  settings:
    'M9 4h6l1 3 3 1v8l-3 1-1 3H9l-1-3-3-1V8l3-1 1-3M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  theme:
    'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  import: 'M12 15V3m-4 4 4-4 4 4M4 14v6h16v-6',
  animation: 'm9 5 10 7-10 7V5',
  source: 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18',
  reset: 'M4 10a8 8 0 1 1 1 7M4 4v6h6',
} as const;

export function ToolIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      className="tool-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
