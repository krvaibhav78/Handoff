
require("dotenv").config();

const express = require("express");
const pool = require("./db");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 5000;

const CATEGORIES = ["Books", "Electronics", "Furniture", "Other"];
const CONDITIONS = ["New", "Like New", "Used"];
const MAX_PRICE = 99999999.99;
const MAX_DESCRIPTION_LENGTH = 5000;

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

app.disable("x-powered-by");

// Enable this only when your deployment is behind a trusted proxy.
// Configure the exact proxy environment before enabling it.
// app.set("trust proxy", 1);

app.use(helmet());

app.use(express.json({ limit: "20kb" }));

// Set FRONTEND_URL in production to your deployed frontend origin.
// Example: FRONTEND_URL=https://your-frontend.example
const allowedOrigins = [
  "http://localhost:5173",
  ...(process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : []),
];

app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin header can include server-to-server
      // clients and command-line tools.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Authentication rate limit: 20 requests per 15 minutes per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts. Please try again later.",
  },
});

// Message sending rate limit: 60 requests per 15 minutes per IP.
const messageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many messages sent. Please try again later.",
  },
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function isPositiveIntegerId(value) {
  return (
    typeof value === "string" &&
    /^\d+$/.test(value) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) > 0
  );
}

function isValidImageUrl(imageUrl) {
  if (
    imageUrl === undefined ||
    imageUrl === null ||
    imageUrl === ""
  ) {
    return true;
  }

  if (typeof imageUrl !== "string" || imageUrl.length > 2048) {
    return false;
  }

  try {
    const parsedUrl = new URL(imageUrl);

    return (
      ["http:", "https:"].includes(parsedUrl.protocol) &&
      Boolean(parsedUrl.hostname)
    );
  } catch {
    return false;
  }
}

function validateProduct(body) {
  const {
    title,
    description,
    price,
    category,
    condition,
    image_url,
  } = body || {};

  const validPriceType =
    typeof price === "number" ||
    (typeof price === "string" && price.trim() !== "");

  const numericPrice = Number(price);

  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.trim().length > 150 ||
    (description !== undefined &&
      description !== null &&
      typeof description !== "string") ||
    (typeof description === "string" &&
      description.trim().length > MAX_DESCRIPTION_LENGTH) ||
    !validPriceType ||
    !Number.isFinite(numericPrice) ||
    numericPrice < 0 ||
    numericPrice > MAX_PRICE ||
    !CATEGORIES.includes(category) ||
    !CONDITIONS.includes(condition) ||
    !isValidImageUrl(image_url)
  ) {
    return {
      valid: false,
      error:
        "Invalid product details. Check title, description, price, category, condition, and image URL.",
    };
  }

  return {
    valid: true,
    product: {
      title: title.trim(),
      description: description?.trim() || null,
      price: numericPrice,
      category,
      condition,
      image_url: image_url || null,
    },
  };
}

function createToken(user) {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be configured with at least 32 characters."
    );
  }

  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
    },
    secret,
    {
      expiresIn: "1h",
      algorithm: "HS256",
    }
  );
}

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================

function requireAuth(req, res, next) {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    console.error("JWT_SECRET is missing or too short.");

    return res.status(500).json({
      error: "Authentication is not configured correctly.",
    });
  }

  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return res.status(401).json({
      error: "Please log in to do that.",
    });
  }

  try {
    const payload = jwt.verify(match[1], secret, {
      algorithms: ["HS256"],
    });

    if (
      !payload ||
      !Number.isSafeInteger(payload.userId) ||
      payload.userId < 1 ||
      typeof payload.email !== "string"
    ) {
      throw new Error("Invalid token payload");
    }

    req.user = {
      id: payload.userId,
      email: payload.email,
    };

    next();
  } catch {
    return res.status(401).json({
      error: "Your session has expired. Please log in again.",
    });
  }
}

// ==========================================
// HOME
// ==========================================

app.get("/", (req, res) => {
  res.send("Welcome to Handoff!");
});

// ==========================================
// REGISTER
// POST /auth/register
// ==========================================

app.post("/auth/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 100 ||
      typeof email !== "string" ||
      email.trim().length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 72
    ) {
      return res.status(400).json({
        error:
          "Enter a valid name and email, and a password of 8–72 characters.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name.trim(), normalizedEmail, passwordHash]
    );

    const user = result.rows[0];
    const token = createToken(user);

    return res.status(201).json({
      message: "Account created successfully.",
      user,
      token,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "An account with this email already exists.",
      });
    }

    console.error("Registration error:", error.message);

    return res.status(500).json({
      error: "Could not create account.",
    });
  }
});

// ==========================================
// LOGIN
// POST /auth/login
// ==========================================

app.post("/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      email.trim().length > 255 ||
      !email.trim() ||
      typeof password !== "string" ||
      !password ||
      password.length > 72
    ) {
      return res.status(400).json({
        error: "Enter a valid email and password.",
      });
    }

    const result = await pool.query(
      `SELECT id, name, email, password_hash, created_at
       FROM users
       WHERE LOWER(email) = LOWER($1)`,
      [email.trim()]
    );

    const user = result.rows[0];

    if (
      !user ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      created_at: user.created_at,
    };

    const token = createToken(safeUser);

    return res.json({
      message: "Login successful.",
      user: safeUser,
      token,
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      error: "Could not log in.",
    });
  }
});

// ==========================================
// GET PRODUCTS, SEARCH AND FILTER
// GET /products
// ==========================================

app.get("/products", async (req, res) => {
  try {
    const { search, category } = req.query;

    if (
      search !== undefined &&
      (typeof search !== "string" || search.length > 100)
    ) {
      return res.status(400).json({
        error: "Search must be a string of at most 100 characters.",
      });
    }

    if (
      category !== undefined &&
      (typeof category !== "string" ||
        (category !== "All" && !CATEGORIES.includes(category)))
    ) {
      return res.status(400).json({
        error: "Invalid category.",
      });
    }

    let query = `
      SELECT p.*, u.name AS seller_name
      FROM products p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE 1=1
    `;

    const values = [];

    if (typeof search === "string" && search.trim()) {
      values.push(`%${search.trim()}%`);

      query += `
        AND (
          p.title ILIKE $${values.length}
          OR COALESCE(p.description, '') ILIKE $${values.length}
        )
      `;
    }

    if (typeof category === "string" && category !== "All") {
      values.push(category);
      query += ` AND p.category = $${values.length}`;
    }

    query += " ORDER BY p.id ASC";

    const result = await pool.query(query, values);

    return res.json(result.rows);
  } catch (error) {
    console.error("Fetch products error:", error.message);

    return res.status(500).json({
      error: "Could not fetch products.",
    });
  }
});

// ==========================================
// GET ONE PRODUCT
// GET /products/:id
// ==========================================

app.get("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isPositiveIntegerId(id)) {
      return res.status(400).json({
        error: "Product ID must be a positive integer.",
      });
    }

    const result = await pool.query(
      `SELECT p.*, u.name AS seller_name
       FROM products p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Product not found.",
      });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Get product error:", error.message);

    return res.status(500).json({
      error: "Could not fetch product.",
    });
  }
});

// ==========================================
// CREATE PRODUCT
// POST /products
// ==========================================

app.post("/products", requireAuth, async (req, res) => {
  try {
    const validation = validateProduct(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        error: validation.error,
      });
    }

    const {
      title,
      description,
      price,
      category,
      condition,
      image_url,
    } = validation.product;

    const result = await pool.query(
      `INSERT INTO products
       (title, description, price, category, condition, image_url, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        title,
        description,
        price,
        category,
        condition,
        image_url,
        req.user.id,
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create product error:", error.message);

    return res.status(500).json({
      error: "Could not create product.",
    });
  }
});

// ==========================================
// UPDATE PRODUCT (OWNER ONLY)
// PUT /products/:id
// ==========================================

app.put("/products/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isPositiveIntegerId(id)) {
      return res.status(400).json({
        error: "Invalid product ID.",
      });
    }

    const validation = validateProduct(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        error: validation.error,
      });
    }

    const {
      title,
      description,
      price,
      category,
      condition,
      image_url,
    } = validation.product;

    const result = await pool.query(
      `UPDATE products
       SET title = $1,
           description = $2,
           price = $3,
           category = $4,
           condition = $5,
           image_url = $6
       WHERE id = $7 AND user_id = $8
       RETURNING *`,
      [
        title,
        description,
        price,
        category,
        condition,
        image_url,
        id,
        req.user.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Product not found or you do not own this listing.",
      });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Update product error:", error.message);

    return res.status(500).json({
      error: "Could not update product.",
    });
  }
});

// ==========================================
// DELETE PRODUCT (OWNER ONLY)
// DELETE /products/:id
// ==========================================

app.delete("/products/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isPositiveIntegerId(id)) {
      return res.status(400).json({
        error: "Invalid product ID.",
      });
    }

    const result = await pool.query(
      `DELETE FROM products
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Product not found or you do not own this listing.",
      });
    }

    return res.json({
      message: "Product deleted successfully.",
      product: result.rows[0],
    });
  } catch (error) {
    console.error("Delete product error:", error.message);

    return res.status(500).json({
      error: "Could not delete product.",
    });
  }
});

// ==========================================
// BUYER–SELLER CHAT
// ==========================================

// POST /conversations
// Body: { "product_id": 1 }

app.post("/conversations", requireAuth, async (req, res) => {
  try {
    const rawProductId = (req.body || {}).product_id;

    if (
      !(
        (typeof rawProductId === "number" &&
          Number.isSafeInteger(rawProductId)) ||
        (typeof rawProductId === "string" &&
          /^\d+$/.test(rawProductId) &&
          Number.isSafeInteger(Number(rawProductId)))
      ) ||
      Number(rawProductId) < 1
    ) {
      return res.status(400).json({
        error: "A valid product ID is required.",
      });
    }

    const productId = Number(rawProductId);

    const productResult = await pool.query(
      `SELECT id, title, user_id
       FROM products
       WHERE id = $1`,
      [productId]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({
        error: "Product not found.",
      });
    }

    const product = productResult.rows[0];
    const buyerId = req.user.id;
    const sellerId = product.user_id;

    if (!sellerId) {
      return res.status(400).json({
        error: "This listing has no registered seller.",
      });
    }

    if (Number(sellerId) === buyerId) {
      return res.status(400).json({
        error: "You cannot start a conversation with yourself.",
      });
    }

    await pool.query(
      `INSERT INTO conversations (product_id, buyer_id, seller_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id, buyer_id) DO NOTHING`,
      [product.id, buyerId, sellerId]
    );

    const result = await pool.query(
      `SELECT c.id, c.product_id, c.buyer_id, c.seller_id,
              c.created_at, p.title AS product_title,
              u.name AS seller_name
       FROM conversations c
       JOIN products p ON p.id = c.product_id
       JOIN users u ON u.id = c.seller_id
       WHERE c.product_id = $1 AND c.buyer_id = $2`,
      [product.id, buyerId]
    );

    return res.status(200).json({
      message: "Conversation opened successfully.",
      conversation: result.rows[0],
    });
  } catch (error) {
    console.error("Start conversation error:", error.message);

    return res.status(500).json({
      error: "Could not open conversation.",
    });
  }
});

// GET /conversations
// Get the authenticated user's inbox.

app.get("/conversations", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.product_id, c.buyer_id, c.seller_id,
              c.created_at, p.title AS product_title,
              p.image_url, p.price,
              buyer.name AS buyer_name,
              seller.name AS seller_name,
              last_message.body AS last_message,
              last_message.created_at AS last_message_at
       FROM conversations c
       JOIN products p ON p.id = c.product_id
       JOIN users buyer ON buyer.id = c.buyer_id
       JOIN users seller ON seller.id = c.seller_id
       LEFT JOIN LATERAL (
         SELECT m.body, m.created_at
         FROM messages m
         WHERE m.conversation_id = c.id
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT 1
       ) last_message ON TRUE
       WHERE c.buyer_id = $1 OR c.seller_id = $1
       ORDER BY
         COALESCE(last_message.created_at, c.created_at) DESC,
         c.id DESC`,
      [req.user.id]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Fetch inbox error:", error.message);

    return res.status(500).json({
      error: "Could not load conversations.",
    });
  }
});

// GET /conversations/:id/messages
// Get messages after checking conversation membership.

app.get(
  "/conversations/:id/messages",
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isPositiveIntegerId(id)) {
        return res.status(400).json({
          error: "Invalid conversation ID.",
        });
      }

      const access = await pool.query(
        `SELECT id
         FROM conversations
         WHERE id = $1
           AND (buyer_id = $2 OR seller_id = $2)`,
        [id, req.user.id]
      );

      if (access.rows.length === 0) {
        return res.status(404).json({
          error: "Conversation not found.",
        });
      }

      const result = await pool.query(
        `SELECT m.id, m.conversation_id, m.sender_id,
                u.name AS sender_name, m.body, m.created_at
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id = $1
         ORDER BY m.created_at ASC, m.id ASC`,
        [id]
      );

      return res.json(result.rows);
    } catch (error) {
      console.error("Fetch messages error:", error.message);

      return res.status(500).json({
        error: "Could not load messages.",
      });
    }
  }
);

// POST /conversations/:id/messages
// Body: { "body": "Hello!" }

app.post(
  "/conversations/:id/messages",
  requireAuth,
  messageLimiter,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { body } = req.body || {};

      if (!isPositiveIntegerId(id)) {
        return res.status(400).json({
          error: "Invalid conversation ID.",
        });
      }

      if (
        typeof body !== "string" ||
        !body.trim() ||
        body.trim().length > 2000
      ) {
        return res.status(400).json({
          error: "Message must contain 1–2000 characters.",
        });
      }

      const access = await pool.query(
        `SELECT id
         FROM conversations
         WHERE id = $1
           AND (buyer_id = $2 OR seller_id = $2)`,
        [id, req.user.id]
      );

      if (access.rows.length === 0) {
        return res.status(404).json({
          error: "Conversation not found.",
        });
      }

      const result = await pool.query(
        `INSERT INTO messages (conversation_id, sender_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, conversation_id, sender_id, body, created_at`,
        [id, req.user.id, body.trim()]
      );

      return res.status(201).json({
        message: "Message sent successfully.",
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Send message error:", error.message);

      return res.status(500).json({
        error: "Could not send message.",
      });
    }
  }
);

// ==========================================
// DATABASE TEST
// Disabled in production; requires authentication in development.
// ==========================================

if (process.env.NODE_ENV !== "production") {
  app.get("/db-test", requireAuth, async (req, res) => {
    try {
      const result = await pool.query("SELECT NOW()");
      return res.json(result.rows);
    } catch (error) {
      console.error("Database error:", error.message);

      return res.status(500).json({
        error: "Database connection failed.",
      });
    }
  });
}

// ==========================================
// UNKNOWN ROUTES
// ==========================================

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found.",
  });
});

// ==========================================
// ERROR HANDLER
// ==========================================

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      error: "Request body is too large.",
    });
  }

  if (error.message === "Origin not allowed by CORS") {
    return res.status(403).json({
      error: "This origin is not allowed.",
    });
  }

  if (error instanceof SyntaxError && error.status === 400) {
    return res.status(400).json({
      error: "Invalid JSON request body.",
    });
  }

  console.error("Unhandled server error:", error.message);

  return res.status(500).json({
    error: "An unexpected server error occurred.",
  });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Handoff server running on http://localhost:${PORT}`);

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error(
      "WARNING: Set JWT_SECRET to a random secret of at least 32 characters."
    );
  }
});
