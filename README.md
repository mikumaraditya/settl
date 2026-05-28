# Settl 💸

Settl is a premium, modern, and responsive MERN-stack bill-sharing and expense-splitting application. It is designed to help friends, roommates, and travel groups manage shared costs, simplify complex debts, resolve disputes, and confirm payments securely using built-in **Gemini AI-powered payment screenshot verification**.

---

## 🤔 What is Settl?

Settl is built for Indian college students and young professionals who are tired of the awkwardness of splitting bills. Whether it's a Goa trip, flat expenses, or a group dinner — Settl tracks every rupee, calculates the minimum payments needed to settle all debts, and facilitates direct UPI payments between members.

No middleman. No payment gateway fees. Just clean, honest expense tracking.

---

## ✨ Features

### 💰 Smart Expense Splitting
* **Flexible Grouping:** Create dedicated groups for any occasion—trips, flatmates, dinners, and more.
* **Granular Splitting:** Split expenses equally, by exact amounts, or by custom percentages.
* **Category Tagging:** Organize spending effortlessly with tags for *Food*, *Travel*, *Shopping*, and *Entertainment*.
* **Lazy-Loaded History:** Navigate your financial history smoothly with month-wise expense pagination.

---

### 🧮 Debt Simplification Algorithm
* **Minimized Transactions:** Powered by a proprietary greedy algorithm that reduces complex $N^2$ debt networks down to the absolute minimum number of transfers.
* **Proven Efficiency:** For example, a group of 6 people with 20 mixed expenses (up to 30 potential debts) is optimized down to just 5 targeted payments.
* **Mathematically Optimal:** Guaranteed to yield the lowest possible number of transactions—it literally cannot be reduced further.

---

### ⚡ Real-Time Synchronization
* **WebSocket Powered:** Built on top of `Socket.io` to deliver instantaneous data synchronization across all clients.
* **Live Updates:** The moment an expense is added, everyone in the group sees it update on their screens instantly.
* **Instant Notifications:** Receive real-time alerts the second a payment is confirmed or disputed.
* **Zero Refreshes:** Enjoy a seamless single-page application experience with zero page refreshes required.

---

### 💸 Seamless UPI Payment Flow
* **Desktop QR Codes:** Generates dynamic, on-the-fly QR codes that you can scan with any UPI app (GPay, PhonePe, Paytm).
* **Mobile Deep Linking:** Tapping pay on mobile launches your preferred UPI app automatically with the exact amount and receiver VPA pre-filled.
* **One-Click Copy:** Quickly copy UPI IDs directly to your clipboard for manual transfers.
* **Direct P2P:** Settl operates on a pure peer-to-peer model—we never touch, hold, or route your money.

---

### 🤝 Two-Party Payment Confirmation
* **Dual Verification:** When a payer marks a debt as settled, the receiver is instantly notified to verify the claim.
* **Dispute Mechanism:** Receivers can accept the settlement or log a formal dispute. Both parties must agree before a debt is cleared.
* **Transparent Logs:** Dispute reasons are explicitly recorded and visible to the payer to prevent communication breakdowns and false settlement claims.

---

### 🤖 Gemini AI Dispute Resolution
* **Automated Verification:** Stuck in a dispute? Upload a payment screenshot and the transaction UTR number.
* **Advanced OCR:** **Google Gemini 2.5 Flash** automatically parses the screenshot to validate the amount, UPI ID, transaction status, and timestamp.
* **Fraud Detection:** Built-in safeguards detect physical photos of screens and digital image tampering.
* **Smart Escalation:** Automatically marks legitimate payments as confirmed, or routes edge cases to manual group review if the data is unclear.

---

### 💡 AI-Powered Financial Insights
* **Dynamic Content:** Google Gemini generates 10 fresh, highly personalized financial tips during every login session.
* **Comprehensive Scope:** Tips span 5 critical areas: *Budgeting*, *Investing*, *Debt Management*, *Indian Personal Finance*, and *Group Spending Habits*.
* **Localization:** Highly localized context for Indian users, featuring advice on SIPs, PPF, Section 80C tax savings, CIBIL scores, and daily UPI limits.
* **Optimized Storage:** Cached in `sessionStorage` to prevent API spam while ensuring fresh insights upon re-login.
* **Graceful Fallbacks:** Hardcoded fallback cards ensure the UI never looks blank if the AI API encounters downtime.

---

### 📧 Secure Email Verification
* **Branded Communication:** Custom-tailored transactional emails sent securely via `Nodemailer` and `Gmail SMTP`.
* **Dashboard Banner:** Resend verification links instantly via a persistent banner if the original email is missed.
* **Secure Tokens:** Tokens expire automatically after 48 hours to ensure strict account security.

---

### 🌓 Adaptive Light and Dark Mode
* **Universal Support:** Full, native theme switching across all components, charts, and dashboards.
* **Persistent Settings:** System or manual user preferences are cached securely across sessions to prevent theme flickering on reload.

---

## 🧠 The Debt Simplification Algorithm

This is the core technical feature that makes Settl intelligent.

**The problem:** In a group of N people, there can be up to N×(N-1) individual debts. Paying each one separately is inefficient and time-consuming.

**The solution — greedy net balance matching:**
- Calculate the net balance of each user (total paid minus share of expenses).
- Users with positive net balances are creditors; users with negative balances are debtors.
- Greedily match the largest debtor with the largest creditor to resolve their debt.
- Repeat until all balances are settled, minimizing total transactions.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: Vite + React 19
- **Styling**: TailwindCSS + Custom CSS Variables
- **API Client**: Axios (configured with intercepts for token injection)
- **Real-Time Client**: Socket.io Client

### Backend
- **Server**: Node.js + Express
- **Database**: MongoDB (configured with Mongoose schemas)
- **File Uploads**: Multer (handles payment screenshot validation)
- **AI Processing**: Gemini API (via direct Google Generative AI endpoints)
- **Mail Service**: Nodemailer (SMTP verification mailer)
- **Authentication**: JWT (JSON Web Tokens) + BcryptJS password hashing

---

## 📂 Project Structure

```text
Settl/
├── backend/                  # Node.js + Express Server
│   ├── src/
│   │   ├── config/           # Database, Mail, Multer configurations
│   │   ├── models/           # Mongoose schemas (User, Group, Expense, Settlement)
│   │   ├── routes/           # REST APIs (auth, groups, expenses, settlements)
│   │   └── socket.js         # WebSocket connections
│   ├── server.js             # Main server entrypoint
│   └── start.js              # Dev launcher with env config
├── frontend/                 # Vite + React Client
│   ├── public/               # Static assets
│   ├── src/
│   │   ├── api/              # Axios configurations
│   │   ├── components/       # Reusable components (Navbar, Modals)
│   │   ├── context/          # State management (Auth, Notifications)
│   │   ├── pages/            # Core views (Dashboard, GroupDetails, Profile, Login)
│   │   └── main.jsx          # Frontend entrypoint
│   └── vite.config.js        # Vite config
└── uploads/                  # Temporary file upload outputs (git-ignored)
```

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js v18 or higher
- MongoDB Atlas account (free tier works)
- Gmail account with App Password enabled
- Google Gemini API key (free at aistudio.google.com)

---

### 1. Configure the Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install the server dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file inside `backend/` and configure the following variables:
   ```env
   PORT=5000
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_signing_key
   GMAIL_USER=your_gmail_address@gmail.com
   GMAIL_APP_PASSWORD=your_16_character_app_password
   FRONTEND_URL=http://localhost:5173
   GEMINI_API_KEY=your_gemini_api_key
   ```

---

### 2. Configure the Frontend

1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install the client dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file inside `frontend/` and configure:
   ```env
   VITE_GEMINI_API_KEY=your_gemini_api_key
   ```

---

## 🏃 Running the Application

To run the application locally in development mode:

1. **Start the Backend Server**:
   ```bash
   cd backend
   ```
   * Production mode: `npm start` (Runs `node server.js`)
   * Development mode: `npm run dev` (Runs `nodemon start.js` with auto-restarts on change)

2. **Start the Frontend Development Server**:
   ```bash
   cd frontend
   ```
   * Development server: `npm run dev` (Spins up the Vite server at `http://localhost:5173`)
   * Build for production: `npm run build` (Generates minified assets in the `dist/` folder)

---

## 🔒 Security

- All `.env` files and `node_modules` are git-ignored — never committed
- Passwords hashed with bcryptjs before storing in database
- JWT tokens expire after 30 days
- Email verification tokens expire after 48 hours
- Multer validates file type and size before accepting uploads
- CORS restricted to frontend URL in production
- Gemini API key rate monitored via Google AI Studio console

---

<div align="center">

Built with ❤️ for splitting bills without the awkwardness

⭐ **Star this repo if Settl saved a friendship!**

</div>
