export default function SignupHeroIllustration() {
  return (
    <svg
      className="auth-hero-art signup-hero-art"
      viewBox="0 0 820 490"
      role="img"
      aria-labelledby="signup-art-title signup-art-description"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="signup-art-title">Bring your group together with Settl</title>
      <desc id="signup-art-description">A shared expense board with group members, an expense breakdown and a balanced group total.</desc>
      <defs>
        <linearGradient id="signup-panel" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#1D3158" />
          <stop offset="1" stopColor="#101D38" />
        </linearGradient>
        <linearGradient id="signup-card" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#234C70" />
          <stop offset="1" stopColor="#16364B" />
        </linearGradient>
        <linearGradient id="signup-violet" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#9878FF" />
          <stop offset="1" stopColor="#6046C7" />
        </linearGradient>
        <linearGradient id="signup-blue" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#5A91FF" />
          <stop offset="1" stopColor="#3157CE" />
        </linearGradient>
        <linearGradient id="signup-mint" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#49D8B0" />
          <stop offset="1" stopColor="#168D86" />
        </linearGradient>
        <filter id="signup-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#020817" floodOpacity=".35" />
        </filter>
        <filter id="signup-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="22" />
        </filter>
      </defs>

      <ellipse cx="421" cy="258" rx="335" ry="198" fill="#526CFF" opacity=".17" filter="url(#signup-glow)" />
      <ellipse cx="420" cy="257" rx="300" ry="190" fill="none" stroke="#7790FF" strokeOpacity=".34" strokeWidth="1.5" strokeDasharray="6 11" />
      <path d="M148 104C222 34 333 21 414 44" fill="none" stroke="#8D9FFF" strokeOpacity=".34" strokeWidth="2" />
      <path d="M474 438C589 446 697 392 744 302" fill="none" stroke="#A17EFF" strokeOpacity=".34" strokeWidth="2" />

      {/* Small floating group markers */}
      <g transform="translate(83 132)">
        <rect width="84" height="84" rx="24" fill="url(#signup-violet)" stroke="#C8B9FF" strokeOpacity=".62" />
        <circle cx="31" cy="31" r="10" fill="none" stroke="#FFF" strokeWidth="3" />
        <circle cx="54" cy="35" r="8" fill="none" stroke="#FFF" strokeWidth="3" />
        <path d="M15 65c2-15 29-20 39-3M43 62c3-10 18-14 28-4" fill="none" stroke="#FFF" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g transform="translate(681 102)">
        <rect width="78" height="78" rx="23" fill="url(#signup-blue)" stroke="#A8C1FF" strokeOpacity=".62" />
        <rect x="20" y="18" width="38" height="43" rx="6" fill="none" stroke="#FFF" strokeWidth="2.8" />
        <path d="M28 30h22M28 39h22M28 48h14" stroke="#FFF" strokeWidth="2.6" strokeLinecap="round" />
      </g>
      <g transform="translate(690 342)">
        <rect width="76" height="76" rx="22" fill="url(#signup-mint)" stroke="#9AF0D9" strokeOpacity=".66" />
        <path d="M20 39h35M44 27l12 12-12 12" fill="none" stroke="#073B3A" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="translate(104 360)">
        <rect width="76" height="76" rx="22" fill="#26466F" stroke="#8BB7FF" strokeOpacity=".58" />
        <path d="M22 54V38M38 54V24M54 54V15" stroke="#B9D1FF" strokeWidth="7" strokeLinecap="round" />
      </g>

      {/* Main shared expense board */}
      <g filter="url(#signup-shadow)">
        <rect x="194" y="64" width="442" height="350" rx="30" fill="url(#signup-panel)" stroke="#718CFF" strokeOpacity=".75" strokeWidth="1.8" />
        <path d="M195 147H635" stroke="#647CA9" strokeOpacity=".38" />
        <text x="228" y="102" fill="#A9B9DE" fontSize="11" fontWeight="800" letterSpacing="2">YOUR NEW GROUP SPACE</text>
        <text x="228" y="132" fill="#F8FAFF" fontSize="25" fontWeight="800">Good plans start together.</text>
        <rect x="526" y="89" width="78" height="27" rx="13.5" fill="#12483F" stroke="#47DDB4" strokeOpacity=".25" />
        <circle cx="542" cy="102.5" r="4" fill="#5AE3BC" />
        <text x="552" y="106.5" fill="#B6F8E4" fontSize="9.5" fontWeight="800">IN SYNC</text>

        {/* Group member avatars */}
        <text x="228" y="178" fill="#9DAFCE" fontSize="10" fontWeight="800" letterSpacing="1.5">YOUR PEOPLE</text>
        <g transform="translate(230 196)">
          <circle cx="23" cy="23" r="22" fill="url(#signup-blue)" stroke="#AFC7FF" strokeWidth="2" />
          <text x="23" y="29" textAnchor="middle" fill="#FFF" fontSize="16" fontWeight="800">A</text>
        </g>
        <g transform="translate(285 196)">
          <circle cx="23" cy="23" r="22" fill="url(#signup-violet)" stroke="#C7B8FF" strokeWidth="2" />
          <text x="23" y="29" textAnchor="middle" fill="#FFF" fontSize="16" fontWeight="800">R</text>
        </g>
        <g transform="translate(340 196)">
          <circle cx="23" cy="23" r="22" fill="#168F83" stroke="#8EE8D7" strokeWidth="2" />
          <text x="23" y="29" textAnchor="middle" fill="#FFF" fontSize="16" fontWeight="800">S</text>
        </g>
        <g transform="translate(395 196)">
          <circle cx="23" cy="23" r="22" fill="#B16A52" stroke="#FFD0B5" strokeWidth="2" />
          <text x="23" y="29" textAnchor="middle" fill="#FFF" fontSize="16" fontWeight="800">M</text>
        </g>
        <rect x="462" y="205" width="108" height="30" rx="15" fill="#273A61" stroke="#687EB0" strokeOpacity=".5" />
        <text x="516" y="224" textAnchor="middle" fill="#DCE5FF" fontSize="10" fontWeight="700">+ Add friends</text>

        {/* Expense rows */}
        <rect x="220" y="258" width="390" height="54" rx="14" fill="#172A48" stroke="#3D527A" />
        <rect x="232" y="269" width="32" height="32" rx="10" fill="#31598E" />
        <path d="M240 279h16v12h-16zM244 275h8" fill="none" stroke="#E5EEFF" strokeWidth="1.7" strokeLinecap="round" />
        <text x="277" y="280" fill="#F4F7FF" fontSize="12" fontWeight="750">Weekend getaway</text>
        <text x="277" y="296" fill="#9EAEC9" fontSize="9.5">Stay · Travel · Food</text>
        <text x="590" y="289" textAnchor="end" fill="#F1F5FF" fontSize="15" fontWeight="800">₹8,400</text>

        <rect x="220" y="323" width="390" height="54" rx="14" fill="#172A48" stroke="#3D527A" />
        <rect x="232" y="334" width="32" height="32" rx="10" fill="#604A97" />
        <path d="M240 344h16v12h-16zM243 340h10" fill="none" stroke="#F0E8FF" strokeWidth="1.7" strokeLinecap="round" />
        <text x="277" y="345" fill="#F4F7FF" fontSize="12" fontWeight="750">Dinner with friends</text>
        <text x="277" y="361" fill="#9EAEC9" fontSize="9.5">Split equally · 4 members</text>
        <text x="590" y="354" textAnchor="end" fill="#6EE6C5" fontSize="15" fontWeight="800">₹1,600</text>
      </g>

      {/* Floating balance summary */}
      <g transform="translate(25 236)" filter="url(#signup-shadow)">
        <rect width="190" height="112" rx="21" fill="#163B4A" stroke="#55DDB9" strokeOpacity=".7" />
        <text x="20" y="28" fill="#B8D9E5" fontSize="9" fontWeight="800" letterSpacing="1">GROUP TOTAL</text>
        <text x="20" y="63" fill="#F8FFFF" fontSize="27" fontWeight="900">₹10,000</text>
        <rect x="20" y="78" width="150" height="8" rx="4" fill="#315C68" />
        <rect x="20" y="78" width="112" height="8" rx="4" fill="#55DDB9" />
        <text x="20" y="102" fill="#A5EBD9" fontSize="8.5" fontWeight="700">EVERYONE'S SHARE, CLEARLY TRACKED</text>
      </g>

      {/* Floating split confirmation */}
      <g transform="translate(594 268)" filter="url(#signup-shadow)">
        <rect width="190" height="92" rx="20" fill="#302957" stroke="#A894FF" strokeOpacity=".76" />
        <circle cx="31" cy="31" r="14" fill="#1E8E80" />
        <path d="m24 31 5 5 10-11" stroke="#ECFFFA" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="55" y="27" fill="#DDD8FF" fontSize="9" fontWeight="800" letterSpacing="1">SIMPLE SPLITS</text>
        <text x="55" y="46" fill="#FFFFFF" fontSize="13" fontWeight="750">Everyone's clear.</text>
        <text x="20" y="73" fill="#BEB6E8" fontSize="9">No awkward calculations.</text>
      </g>
    </svg>
  )
}
