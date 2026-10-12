
---# Handoff — Student Marketplace

**A full-stack marketplace that helps students buy and sell pre-owned products.**

Handoff makes it easier for students to discover affordable essentials, publish product listings, and give useful items a second life.

🌐 **Live Demo:** [Handoff Marketplace](https://handoff-five-xi.vercel.app/)

## ✨ Features

- 🔐 **User Authentication** — Register and log in securely.
- 🛍️ **Product Listings** — Create, view, edit, and delete listings.
- 🔎 **Search & Filtering** — Find products by keyword and category.
- 🖼️ **Product Images** — Display product images using image URLs.
- 💬 **Buyer–Seller Messaging** — Start conversations about listings and exchange messages.
- 📱 **Responsive UI** — Browse the marketplace on desktop and mobile.
- ☁️ **Cloud Deployment** — Frontend, backend, and database hosted separately.

## 🧰 Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, CSS |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| Authentication | JSON Web Tokens (JWT), bcrypt |
| Deployment | Vercel, Render, Neon PostgreSQL |
| Version Control | Git, GitHub |

## 🏗️ Architecture

```text
              Handoff Marketplace
                       |
                 React + Vite
                    Vercel
                       |
                  HTTPS / API
                       |
                Node.js + Express
                    Render
                       |
                   PostgreSQL
                      Neon
```

## 📂 Project Structure

```text
Handoff/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── ...
│   ├── package.json
│   └── ...
├── backend/
│   ├── server.js
│   ├── db.js
│   ├── package.json
│   └── ...
├── README.md
└── .gitignore
```

*The structure above illustrates the main project layout. Individual files may vary.*

## 🚀 Getting Started

### Prerequisites

- Node.js and npm
- PostgreSQL database or a Neon PostgreSQL database
- Git

### 1. Clone the repository

```bash
git clone https://github.com/krvaibhav78/Handoff.git
cd Handoff
```

### 2. Configure the backend

```bash
cd backend
npm install
```

Create a `.env` file in the `backend` directory:

```env
PORT=5000
DATABASE_URL=your_postgresql_connection_string
JWT_SECRET=your_random_secret_of_at_least_32_characters
FRONTEND_URL=http://localhost:5173
```

Use your own database connection string and a strong, private JWT secret. Never commit real credentials.

Start the backend using the development command configured in `backend/package.json`. If the project uses `npm start`, run:

```bash
npm start
```

### 3. Configure the frontend

Open another terminal:

```bash
cd frontend
npm install
```

Create a `.env` file in `frontend`:

```env
VITE_API_URL=http://localhost:5000
```

Start the frontend:

```bash
npm run dev
```

Open the local URL displayed by Vite, usually `http://localhost:5173`.

## 🔌 API Overview

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Log in |
| GET | `/products` | List and search products |
| GET | `/products/:id` | Retrieve a product |
| POST | `/products` | Create a listing |
| PUT | `/products/:id` | Update your listing |
| DELETE | `/products/:id` | Delete your listing |
| POST | `/conversations` | Start or open a conversation |
| GET | `/conversations` | View your conversations |
| GET | `/conversations/:id/messages` | Retrieve messages |
| POST | `/conversations/:id/messages` | Send a message |

Protected endpoints require a valid bearer token.

## 🔒 Security

- Passwords are hashed before storage.
- Protected routes use JWT authentication.
- Product updates and deletion are restricted to the listing owner.
- CORS is configured to allow approved frontend origins.
- Database credentials and secrets belong in environment variables.

## 🛣️ Future Improvements

- Direct image uploads and image storage
- User profiles and profile pictures
- Product details pages
- Product condition and price filters
- Favorites and saved listings
- Automated testing and CI/CD
- Pagination and improved accessibility

## 👨‍💻 Author

**Kumar Vaibhav**

- GitHub: [@krvaibhav78](https://github.com/krvaibhav78)

## 📄 License

Licensed @krvaibhav78
