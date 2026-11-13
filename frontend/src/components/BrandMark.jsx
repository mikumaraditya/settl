export default function BrandMark({ size = 22 }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="4" y="6.5" width="15.5" height="12" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 6.5V5.7A1.7 1.7 0 0 1 8.7 4h9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14.7 10.5h4.8v4h-4.8a2 2 0 0 1 0-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="15.1" cy="12.5" r=".65" fill="currentColor" />
    </svg>
  )
}
