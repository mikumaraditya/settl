# Settl. 💳

Settl is a MERN-stack expense-splitting and debt-simplification application designed for friends, flatmates, and travel groups. It simplifies the process of tracking group expenses, managing shared bills, and settling balances directly using UPI IDs, dynamic QR codes, and mobile payment deep links.

---

## 🚀 Highlights & Capabilities

### 🎨 Visual Redesign & Presentation Panel
- **Aesthetic Overhaul**: Futuristic split-screen dashboard design with dark-mode color palettes, ambient gradient glows, and delicate grid backdrops.
- **Interactive Visualizer**: Features a vector representation of mathematical debt simplification using glowing SVG curves, animated flows, and glowing avatar badges.
- **Fluid Layout**: Custom translucent rounded scrollbars (`custom-scrollbar` styles) and disabled horizontal scrollbars to optimize the viewport for standard browser zoom levels.

### 💸 Debt Simplification & Settlements
- **Installment Support (Partial Settlements)**: Allows users to make partial settlements. Payers can input custom payment amounts. The app automatically calculates the remaining balance, generates a partial UPI payment request, and updates the simplified debt ledger upon recipient confirmation.
- **Direct P2P Settle Up**: Integrates UPI payment deep-linking (`upi://pay`) and on-the-fly QR code generation using `qrcode.react`, allowing group members to settle up instantly via cash, net banking, or external UPI apps.
- **Verification Blocking Shield**: Implements a responsive two-column grid confirmation modal (`UpiConfirmModal`) that blocks registration and profile saves until the user double-checks and checkbox-authorizes their entered UPI ID to prevent lost payments.

### 🛡️ Authentication & Security
- **HTTP-Only Cookies**: Application JWT tokens are stored securely in HTTP-only cookies, safeguarding them from Cross-Site Scripting (XSS) attacks. The same cookie handles validation for REST endpoints and Socket.IO connections.
- **Email Verification Guard**: Requires users to complete email verification via high-fidelity, secure Nodemailer SMTP tokens before accessing group expenses, settlements, messages, or real-time websocket rooms.
- **Google Identity Integration**: Seamless integration with Google Identity Services for one-tap oauth sign-in and account creation.

---

## 🛠️ Tech Stack Reference

| Layer | Technologies |
| --- | --- |
| **Frontend** | React 19, Vite, Tailwind CSS, Axios, Socket.IO Client, QR Code SVG |
| **Backend** | Node.js, Express, Socket.IO Server |
| **Database** | MongoDB Atlas, Mongoose ODM |
| **Security & Auth** | HTTP-Only JWT Cookie, bcryptjs, Google OAuth 2.0 |
| **Integrations** | Nodemailer / Gmail SMTP, UPI deep link protocols |

---

## 📂 Project Structure

```text
Settl/
|-- backend/
|   |-- src/
|   |   |-- config/       # MongoDB Mongoose connection config
|   |   |-- middleware/   # JWT Auth & requireVerified verification guards
|   |   |-- models/       # User, Group, Expense, Settlement, Message, ActivityLog Schemas
|   |   |-- routes/       # API controllers (auth, groups, expenses, settlements, messages)
|   |   |-- utils/        # Debt simplification engine (greedy match) and email service
|   |   `-- socket.js     # Socket.IO authorization and real-time room hooks
|   `-- server.js         # Entry point for Express & WebSockets
`-- frontend/
    `-- src/
        |-- api/          # Axios configuration & instance
        |-- components/   # Reusable UI (UPIModal, UPIConfirm, ConfirmPayment, Navbar)
        |-- context/      # AuthContext & NotificationContext providers
        `-- pages/        # Application view layouts (Dashboard, SettleUp, Profile, Login, Register)
```

---

## 💻 Setup & Local Development

### Prerequisites
- Node.js version 18 or above
- A running MongoDB instance (Local or Atlas cloud database)
- Google OAuth Client ID credentials (optional for Google login)
- A Gmail account with an **App Password** for SMTP email verification

### 1. Server Configuration
```bash
# Navigate to backend directory and install dependencies
cd backend
npm install
```

Create a `.env` file inside the `backend/` directory:
```env
PORT=5000
MONGO_URI=mongodb+srv://your_username:your_password@your_cluster.mongodb.net/settl
JWT_SECRET=your_long_random_jwt_secret_key
FRONTEND_URL=http://localhost:5173

# Nodemailer credentials for email verification
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_gmail_app_password

# Google OAuth Credentials
GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

Start the backend API server in development mode:
```bash
npm run dev
```

### 2. Client Configuration
```bash
# Navigate to frontend directory and install dependencies
cd ../frontend
npm install
```

Start the Vite client development server:
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📜 Available Scripts

Run these scripts from their respective directory (`backend` or `frontend`):

| Path | Command | Description |
| --- | --- | --- |
| `backend` | `npm start` | Launches Node server in production |
| `backend` | `npm run dev` | Launches server with nodemon auto-reload |
| `frontend` | `npm run dev` | Starts Vite dev client server |
| `frontend` | `npm run build` | Bundles production asset packages |
| `frontend` | `npm run lint` | Inspects codebase with ESLint |

---

## 🔒 Security Practices
- Keep all `.env` files out of public source code repositories.
- Use secure, multi-character secrets for `JWT_SECRET`.
- Ensure `FRONTEND_URL` is set to the exact deployed origin to prevent unauthorized CORS requests.
- Deploy frontend and backend servers over HTTPS in production to enforce secure HTTP-only cookies.

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
