export default function AuthHeroIllustration() {
  return (
    <svg className="auth-hero-art" viewBox="0 0 900 500" role="img" aria-labelledby="auth-art-title auth-art-description" xmlns="http://www.w3.org/2000/svg">
      <title id="auth-art-title">Settl group expense preview</title>
      <desc id="auth-art-description">A phone showing a shared group balance beside a Goa Trip expense snapshot and payment feature icons.</desc>
      <defs>
        <linearGradient id="phone-shell" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#8CA5FF"/><stop offset=".48" stopColor="#243D83"/><stop offset="1" stopColor="#9368FF"/>
        </linearGradient>
        <linearGradient id="phone-screen" x1="0" y1="0" x2=".85" y2="1">
          <stop stopColor="#172A4C"/><stop offset="1" stopColor="#0A142B"/>
        </linearGradient>
        <linearGradient id="balance-card" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#174B63"/><stop offset="1" stopColor="#123C4D"/>
        </linearGradient>
        <linearGradient id="group-card" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#142748"/><stop offset="1" stopColor="#0B1730"/>
        </linearGradient>
        <linearGradient id="icon-purple" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#8D6BFF"/><stop offset="1" stopColor="#6244CF"/>
        </linearGradient>
        <linearGradient id="icon-blue" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#338EDB"/><stop offset="1" stopColor="#2054A8"/>
        </linearGradient>
        <filter id="phone-glow" x="-40%" y="-30%" width="180%" height="170%">
          <feGaussianBlur stdDeviation="16"/>
        </filter>
        <filter id="card-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#020817" floodOpacity=".38"/>
        </filter>
      </defs>

      <ellipse cx="490" cy="266" rx="385" ry="224" fill="#3658C8" opacity=".16" filter="url(#phone-glow)"/>
      <ellipse cx="480" cy="264" rx="346" ry="217" fill="none" stroke="#758CFF" strokeOpacity=".5" strokeWidth="1.6" strokeDasharray="7 10"/>
      <path d="M420 90 C520 10 690 34 750 116" fill="none" stroke="#A88CFF" strokeOpacity=".55" strokeWidth="2"/>
      <path d="M180 378 C270 468 690 475 780 360" fill="none" stroke="#5687E8" strokeOpacity=".4" strokeWidth="2"/>

      <g filter="url(#card-shadow)">
        <rect x="26" y="174" width="352" height="245" rx="25" fill="url(#group-card)" stroke="#657FF5" strokeWidth="1.7"/>
        <text x="54" y="207" fill="#9CADCC" fontSize="11" fontWeight="800" letterSpacing="2">GROUP SNAPSHOT</text>
        <text x="54" y="238" fill="#F7F9FF" fontSize="23" fontWeight="800">Goa Trip</text>
        <rect x="258" y="193" width="94" height="29" rx="14.5" fill="#075C4C"/>
        <circle cx="276" cy="207" r="4" fill="#51E3B0"/>
        <text x="287" y="211" fill="#B8F8DF" fontSize="10" fontWeight="700">Settled 60%</text>
        <path d="M50 256H354" stroke="#33496C" strokeWidth="1"/>
        <circle cx="75" cy="291" r="20" fill="#315DF3"/>
        <text x="75" y="298" textAnchor="middle" fill="white" fontSize="17" fontWeight="800">A</text>
        <text x="108" y="286" fill="#F8FAFF" fontSize="15" fontWeight="700">Aditya</text>
        <text x="108" y="306" fill="#95A6C6" fontSize="11">Paid for dinner</text>
        <text x="348" y="296" textAnchor="end" fill="#EAF0FF" fontSize="16" fontWeight="800">₹2,400</text>
        <path d="M50 326H354" stroke="#33496C" strokeWidth="1"/>
        <circle cx="75" cy="365" r="20" fill="#8652D7"/>
        <text x="75" y="372" textAnchor="middle" fill="white" fontSize="17" fontWeight="800">R</text>
        <text x="108" y="360" fill="#F8FAFF" fontSize="15" fontWeight="700">Rahul</text>
        <text x="108" y="380" fill="#95A6C6" fontSize="11">Share of expenses</text>
        <text x="348" y="370" textAnchor="end" fill="#FF8294" fontSize="15" fontWeight="800">You pay ₹800</text>
      </g>

      <g transform="translate(420 28) rotate(7 170 215)" filter="url(#card-shadow)">
        <rect x="0" y="0" width="338" height="435" rx="48" fill="#050B19" stroke="url(#phone-shell)" strokeWidth="7"/>
        <rect x="11" y="11" width="316" height="413" rx="39" fill="url(#phone-screen)" stroke="#47609B" strokeOpacity=".5"/>
        <rect x="112" y="23" width="116" height="23" rx="11.5" fill="#030712"/>
        <circle cx="286" cy="34" r="4" fill="#6E8FEA"/>
        <rect x="27" y="65" width="34" height="34" rx="10" fill="#315DF3"/>
        <path d="M37 75h15v14H37z M41 71h14v13" fill="none" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
        <text x="71" y="87" fill="#F8FAFF" fontSize="18" fontWeight="800">settl.</text>
        <circle cx="286" cy="82" r="16" fill="#344765"/>
        <circle cx="286" cy="77" r="5" fill="#CFDAF2"/>
        <path d="M277 91c2-8 16-8 18 0" fill="#CFDAF2"/>
        <text x="30" y="132" fill="#F8FAFF" fontSize="23" fontWeight="800">Your group finances</text>
        <text x="30" y="153" fill="#9EAFCC" fontSize="12">Everything in sync.</text>

        <rect x="24" y="174" width="290" height="128" rx="20" fill="url(#balance-card)" stroke="#3C91A8" strokeWidth="1.5"/>
        <text x="43" y="202" fill="#C5D9EA" fontSize="11" fontWeight="800">YOUR NET BALANCE</text>
        <text x="42" y="245" fill="#5DE8BB" fontSize="36" fontWeight="900">₹1,200</text>
        <path d="M203 259 L229 243 L246 248 L270 222 L292 212" fill="none" stroke="#4BDEB0" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="292" cy="212" r="5" fill="#4BDEB0"/>
        <rect x="42" y="263" width="118" height="25" rx="12.5" fill="#0A765E"/>
        <text x="101" y="280" textAnchor="middle" fill="#C8FFEA" fontSize="10" fontWeight="700">You receive ↗</text>

        <rect x="24" y="316" width="290" height="44" rx="14" fill="#1A2B48" stroke="#3B4F70"/>
        <rect x="37" y="325" width="27" height="27" rx="8" fill="#315E91"/>
        <path d="M44 332h13v13H44z M47 329h13" stroke="#D6E7FF" strokeWidth="1.5" fill="none"/>
        <text x="76" y="335" fill="#F7F9FF" fontSize="12" fontWeight="700">Goa Trip</text>
        <text x="76" y="350" fill="#9DAFCB" fontSize="10">5 members · You get ₹1,200</text>
        <path d="m291 332 7 7-7 7" fill="none" stroke="#9DAFCB" strokeWidth="2"/>

        <rect x="24" y="370" width="290" height="42" rx="14" fill="#1A2B48" stroke="#3B4F70"/>
        <rect x="37" y="377" width="27" height="27" rx="8" fill="#674A8D"/>
        <path d="M44 391l6-7 7 7M47 391v7h7v-7" stroke="#E9DFFF" strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
        <text x="76" y="390" fill="#F7F9FF" fontSize="12" fontWeight="700">Roomies</text>
        <text x="76" y="404" fill="#9DAFCB" fontSize="10">4 members · You pay ₹800</text>
        <path d="m291 386 7 7-7 7" fill="none" stroke="#9DAFCB" strokeWidth="2"/>
      </g>

      <g transform="translate(382 94)">
        <rect width="74" height="74" rx="20" fill="url(#icon-purple)" stroke="#A995FF" strokeWidth="1.5"/>
        <circle cx="29" cy="27" r="9" fill="none" stroke="white" strokeWidth="3"/>
        <circle cx="49" cy="32" r="7" fill="none" stroke="white" strokeWidth="3"/>
        <path d="M12 57c2-13 30-17 36 0M40 54c2-8 17-11 23-2" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"/>
      </g>
      <g transform="translate(777 190)">
        <rect width="76" height="76" rx="20" fill="url(#icon-purple)" stroke="#A995FF" strokeWidth="1.5"/>
        <path d="M21 18h35v42H21zM29 29h19M29 38h19M29 47h13" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none"/>
      </g>
      <g transform="translate(725 365)">
        <rect width="80" height="80" rx="20" fill="url(#icon-blue)" stroke="#59A8F4" strokeWidth="1.5"/>
        <path d="M21 42h38M49 31l11 11-11 11M59 25H22M33 14 22 25l11 11" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </g>
      <g transform="translate(320 380)">
        <rect width="76" height="76" rx="20" fill="url(#icon-blue)" stroke="#59A8F4" strokeWidth="1.5"/>
        <path d="M23 57V38M38 57V25M53 57V15" stroke="white" strokeWidth="7" strokeLinecap="round"/>
      </g>
    </svg>
  )
}
