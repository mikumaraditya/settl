export default function LoginHeroArtwork() {
  return (
    <div className="login-hero-artwork" aria-hidden="true">
      <svg viewBox="0 0 700 410" role="presentation" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="loginPhoneFrame" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#90A9FF"/>
            <stop offset=".38" stopColor="#465EEB"/>
            <stop offset="1" stopColor="#9A68E8"/>
          </linearGradient>
          <linearGradient id="loginPhoneScreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#172647"/>
            <stop offset="1" stopColor="#0B1428"/>
          </linearGradient>
          <linearGradient id="loginBalance" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#274C82"/>
            <stop offset="1" stopColor="#173C50"/>
          </linearGradient>
          <linearGradient id="loginGlow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#66A1FF"/>
            <stop offset="1" stopColor="#A77BFF"/>
          </linearGradient>
          <linearGradient id="loginTile" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#536CF0"/>
            <stop offset="1" stopColor="#8C5FE0"/>
          </linearGradient>
          <filter id="loginPhoneShadow" x="-40%" y="-30%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="13"/>
          </filter>
          <filter id="loginSoftShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8"/>
          </filter>
        </defs>

        <ellipse cx="478" cy="365" rx="166" ry="22" fill="#526BFF" opacity=".25" filter="url(#loginSoftShadow)"/>
        <ellipse cx="475" cy="207" rx="186" ry="162" fill="none" stroke="#6B72FF" strokeWidth="1.2" opacity=".22"/>
        <ellipse cx="475" cy="207" rx="211" ry="183" fill="none" stroke="#9C70F1" strokeWidth="1" opacity=".16" strokeDasharray="4 9"/>

        <g className="login-art-float login-art-chip-left">
          <rect x="350" y="70" width="66" height="66" rx="19" fill="url(#loginTile)" stroke="#B8C6FF" strokeOpacity=".54"/>
          <path d="M371 101c0-5 4-9 9-9s9 4 9 9-4 9-9 9-9-4-9-9Zm22 2c5 0 9 4 9 9v3h-13" fill="none" stroke="#F7F8FF" strokeWidth="3" strokeLinecap="round"/>
        </g>
        <g className="login-art-float login-art-chip-right">
          <rect x="596" y="210" width="68" height="68" rx="20" fill="url(#loginTile)" stroke="#C5B3FF" strokeOpacity=".58"/>
          <path d="M615 231h30v22h-30zM621 238h18M621 245h12" fill="none" stroke="#F7F8FF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
        </g>
        <g className="login-art-float login-art-chip-bottom">
          <rect x="331" y="310" width="58" height="58" rx="17" fill="#1D3E71" stroke="#82B3FF" strokeOpacity=".58"/>
          <path d="M360 322v29m-8-21h16m-16 12h16" stroke="#A8C6FF" strokeWidth="2.7" strokeLinecap="round"/>
        </g>

        <g className="login-art-orbit">
          <path d="M290 260c55-123 169-174 298-128 83 30 115 100 69 168-46 68-147 93-245 66" fill="none" stroke="url(#loginGlow)" strokeWidth="2.4" strokeLinecap="round" opacity=".78"/>
          <path d="M315 280c54 81 157 110 255 75" fill="none" stroke="#8B76FF" strokeWidth="1.4" opacity=".42"/>
        </g>

        <g transform="rotate(7 502 199)">
          <rect x="409" y="16" width="224" height="365" rx="34" fill="#6483FF" opacity=".3" filter="url(#loginPhoneShadow)"/>
          <rect x="398" y="9" width="224" height="365" rx="34" fill="#080F20" stroke="url(#loginPhoneFrame)" strokeWidth="3"/>
          <rect x="407" y="18" width="206" height="347" rx="27" fill="url(#loginPhoneScreen)" stroke="#7D94F9" strokeOpacity=".25"/>
          <rect x="470" y="24" width="82" height="17" rx="9" fill="#050A14"/>
          <circle cx="585" cy="32" r="3" fill="#8DB0FF"/>
          <rect x="421" y="55" width="27" height="27" rx="9" fill="#4265F4"/>
          <path d="M429 62h11v13h-11zM432 65h7m-7 4h5" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
          <text x="455" y="74" fill="#F5F7FF" fontSize="14" fontWeight="800" letterSpacing="-.6">settl.</text>
          <circle cx="584" cy="68" r="13" fill="#263754"/>
          <circle cx="584" cy="64" r="4" fill="#AFC1FF"/>
          <path d="M576 76c2-7 14-7 16 0" fill="#8298DD"/>

          <text x="421" y="111" fill="#F8FAFF" fontSize="17" fontWeight="750">Your group finances</text>
          <text x="421" y="128" fill="#A9B5CC" fontSize="9.5">Everything is in sync.</text>
          <rect x="420" y="143" width="180" height="92" rx="17" fill="url(#loginBalance)" stroke="#6BBAE5" strokeOpacity=".48"/>
          <text x="435" y="163" fill="#B8D0F6" fontSize="9.5" fontWeight="600">YOUR NET POSITION</text>
          <text x="435" y="192" fill="#5BE2C0" fontSize="25" fontWeight="800">₹1,200</text>
          <path d="M548 196c8-3 13-12 22-9 8 3 12-8 21-13" fill="none" stroke="#60DFC0" strokeWidth="2.6" strokeLinecap="round"/>
          <circle cx="591" cy="174" r="3" fill="#60DFC0"/>

          <rect x="420" y="246" width="180" height="43" rx="12" fill="#17243B" stroke="#344664"/>
          <rect x="430" y="255" width="25" height="25" rx="8" fill="#294B81"/>
          <path d="M437 262h11v10h-11zM439 259h7" fill="none" stroke="#BFD0FF" strokeWidth="1.5" strokeLinecap="round"/>
          <text x="464" y="264" fill="#F3F5FF" fontSize="10" fontWeight="700">Goa Trip</text>
          <text x="464" y="278" fill="#9EABC2" fontSize="8.5">5 members · In balance</text>
          <circle cx="580" cy="267" r="10" fill="#153B37"/>
          <path d="m576 267 3 3 6-7" fill="none" stroke="#55DAB6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>

          <rect x="420" y="296" width="180" height="43" rx="12" fill="#17243B" stroke="#344664"/>
          <rect x="430" y="305" width="25" height="25" rx="8" fill="#453A78"/>
          <path d="M436 317h13m-10-4 10 4-10 4" fill="none" stroke="#D7C5FF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          <text x="464" y="314" fill="#F3F5FF" fontSize="10" fontWeight="700">Roomies</text>
          <text x="464" y="328" fill="#9EABC2" fontSize="8.5">4 members · You owe</text>
        </g>

        <g className="login-art-summary">
          <rect x="20" y="185" width="286" height="154" rx="21" fill="#101D35" fillOpacity=".92" stroke="#829BFF" strokeOpacity=".55"/>
          <path d="M21 242h284" stroke="#7284B5" strokeOpacity=".25"/>
          <text x="42" y="211" fill="#9FAED1" fontSize="9" fontWeight="800" letterSpacing="1.5">GROUP SNAPSHOT</text>
          <text x="42" y="232" fill="#F8FAFF" fontSize="16" fontWeight="800">Goa Trip</text>
          <rect x="220" y="199" width="67" height="24" rx="12" fill="#124B49"/>
          <circle cx="232" cy="211" r="3.3" fill="#5EE0BE"/>
          <text x="241" y="214" fill="#6DE5C5" fontSize="8" fontWeight="700">In balance</text>

          <circle cx="49" cy="267" r="14" fill="#3E64E9"/>
          <text x="49" y="271" fill="#FFF" fontSize="11" fontWeight="800" textAnchor="middle">A</text>
          <text x="73" y="263" fill="#F3F5FF" fontSize="11" fontWeight="750">Aditya</text>
          <text x="73" y="277" fill="#9EABC2" fontSize="8.5">Paid for dinner</text>
          <text x="282" y="271" fill="#F3F5FF" fontSize="11" fontWeight="800" textAnchor="end">₹2,400</text>

          <path d="M38 291h250" stroke="#7182AA" strokeOpacity=".22"/>
          <circle cx="49" cy="313" r="14" fill="#7550D6"/>
          <text x="49" y="317" fill="#FFF" fontSize="11" fontWeight="800" textAnchor="middle">R</text>
          <text x="73" y="309" fill="#F3F5FF" fontSize="11" fontWeight="750">Rahul</text>
          <text x="73" y="323" fill="#9EABC2" fontSize="8.5">Share of expenses</text>
          <text x="282" y="317" fill="#FF818B" fontSize="10.5" fontWeight="800" textAnchor="end">Owes ₹800</text>
        </g>
      </svg>
    </div>
  )
}
