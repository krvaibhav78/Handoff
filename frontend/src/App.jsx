
import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5000";
const SESSION_KEY = "handoff_session";

function readSession() {
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function App() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [editingProduct, setEditingProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState(readSession);
  const [authMode, setAuthMode] = useState("login");
  const [authBusy, setAuthBusy] = useState(false);

  // Chat state
  const [inbox, setInbox] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [chatError, setChatError] = useState("");
  const messagesEndRef = useRef(null);

  const token = session?.token || "";
  const user = session?.user || null;

  function authHeaders() {
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  async function readResponse(response) {
    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      logout();
      throw new Error(data.error || "Your session expired. Please log in again.");
    }

    if (!response.ok) {
      throw new Error(data.error || "The request could not be completed.");
    }

    return data;
  }

  function saveSession(nextSession) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
    setEditingProduct(null);
    setInbox([]);
    setActiveConversation(null);
    setChatMessages([]);
    setChatDraft("");
    setMessage("You have logged out.");
  }

  async function fetchProducts(
    searchTerm = search,
    categoryFilter = category
  ) {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();

      if (searchTerm.trim()) {
        params.set("search", searchTerm.trim());
      }

      if (categoryFilter !== "All") {
        params.set("category", categoryFilter);
      }

      const query = params.toString();
      const url = query
        ? `${API_URL}/products?${query}`
        : `${API_URL}/products`;

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load products.");
      }

      if (!Array.isArray(data)) {
        throw new Error("The server returned an unexpected response.");
      }

      setProducts(data);
    } catch (err) {
      setError(err.message || "Unable to connect to Handoff.");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts(search, category);
    }, 250);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category]);

  // Load the inbox whenever the user logs in.
  async function loadInbox() {
    if (!token) {
      setInbox([]);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/conversations`, {
        headers: authHeaders(),
      });

      const data = await readResponse(response);

      setInbox(Array.isArray(data) ? data : []);
    } catch (err) {
      setChatError(err.message || "Could not load conversations.");
    }
  }

  useEffect(() => {
    if (token) {
      loadInbox();
    } else {
      setInbox([]);
      setActiveConversation(null);
      setChatMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Load messages for the selected conversation.
  async function loadMessages(conversationId, showLoader = false) {
    if (!token || !conversationId) return;

    if (showLoader) setChatLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/conversations/${conversationId}/messages`,
        { headers: authHeaders() }
      );

      const data = await readResponse(response);

      if (!Array.isArray(data)) {
        throw new Error("Unexpected message response from server.");
      }

      setChatMessages(data);
      setChatError("");
    } catch (err) {
      setChatError(err.message || "Could not load messages.");
    } finally {
      if (showLoader) setChatLoading(false);
    }
  }

  // Load message history when a conversation is opened.
  useEffect(() => {
    if (!activeConversation?.id || !token) {
      setChatMessages([]);
      return;
    }

    loadMessages(activeConversation.id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversation?.id, token]);

  // Poll the open conversation so new messages appear automatically.
  useEffect(() => {
    if (!activeConversation?.id || !token) return;

    const conversationId = activeConversation.id;

    const timer = setInterval(() => {
      loadMessages(conversationId, false);
      loadInbox();
    }, 4000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversation?.id, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function openConversation(conversation) {
    setActiveConversation(conversation);
    setChatMessages([]);
    setChatDraft("");
    setChatError("");
  }

  async function contactSeller(product) {
    if (!token) {
      setMessage("Please log in to contact the seller.");
      return;
    }

    try {
      setChatError("");

      const response = await fetch(`${API_URL}/conversations`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ product_id: product.id }),
      });

      const data = await readResponse(response);

      // The API may return a conversation object or an ID.
      const conversationId =
        data.id || data.conversation_id || data.conversation?.id;

      if (!conversationId) {
        await loadInbox();
        setMessage("Conversation created. Open it from your inbox.");
        return;
      }

      await loadInbox();

      const conversation = {
        ...data,
        ...(data.conversation || {}),
        id: conversationId,
        product_id: product.id,
        product_title: product.title,
        product_image: product.image_url,
        product_price: product.price,
      };

      setActiveConversation(conversation);
      setChatMessages([]);
      setChatDraft("");
      setChatError("");
      setMessage("Conversation opened.");
    } catch (err) {
      setMessage(err.message || "Could not contact the seller.");
    }
  }

  async function sendMessage(event) {
    event.preventDefault();

    if (!token || !activeConversation?.id) {
      setChatError("Open a conversation before sending a message.");
      return;
    }

    const body = chatDraft.trim();

    if (!body) return;

    if (body.length > 2000) {
      setChatError("Messages must be 2,000 characters or fewer.");
      return;
    }

    try {
      setSendingMessage(true);
      setChatError("");

      const response = await fetch(
        `${API_URL}/conversations/${activeConversation.id}/messages`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ body }),
        }
      );

      await readResponse(response);

      setChatDraft("");

      await loadMessages(activeConversation.id);
      await loadInbox();
    } catch (err) {
      setChatError(err.message || "Could not send your message.");
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleAuth(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const isRegister = authMode === "register";

    const payload = {
      email: String(formData.get("email") || "").trim(),
      password: String(formData.get("password") || ""),
    };

    if (isRegister) {
      payload.name = String(formData.get("name") || "").trim();
    }

    try {
      setAuthBusy(true);
      setMessage("");

      const response = await fetch(
        `${API_URL}/auth/${isRegister ? "register" : "login"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      saveSession({ user: data.user, token: data.token });

      setMessage(
        isRegister
          ? "Account created and logged in successfully!"
          : "Welcome back!"
      );

      form.reset();
    } catch (err) {
      setMessage(err.message || "Could not authenticate.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!token) {
      setMessage("Please log in before publishing a listing.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const price = Number(formData.get("price"));
    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();

    if (!title) return setMessage("Please enter a product title.");

    if (!Number.isFinite(price) || price < 0) {
      return setMessage("Please enter a valid, non-negative price.");
    }

    const newProduct = {
      title,
      description,
      price,
      category: formData.get("category"),
      condition: formData.get("condition"),
      image_url: String(formData.get("image_url") || "").trim(),
    };

    try {
      setSubmitting(true);
      setMessage("");

      const response = await fetch(`${API_URL}/products`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(newProduct),
      });

      const data = await readResponse(response);

      form.reset();
      setSearch("");
      setCategory("All");
      setMessage("Product listed successfully!");

      await fetchProducts("", "All");
    } catch (err) {
      setMessage(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(event) {
    event.preventDefault();

    if (!editingProduct || !token) return;

    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const price = Number(formData.get("price"));

    if (!title) return setMessage("Please enter a product title.");

    if (!Number.isFinite(price) || price < 0) {
      return setMessage("Please enter a valid, non-negative price.");
    }

    const updatedProduct = {
      title,
      description,
      price,
      category: formData.get("category"),
      condition: formData.get("condition"),
      image_url: String(formData.get("image_url") || "").trim(),
    };

    try {
      setSubmitting(true);
      setMessage("");

      const response = await fetch(
        `${API_URL}/products/${editingProduct.id}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify(updatedProduct),
        }
      );

      await readResponse(response);

      setEditingProduct(null);
      setMessage("Product updated successfully!");

      await fetchProducts(search, category);
    } catch (err) {
      setMessage(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(product) {
    if (!token) {
      return setMessage("Please log in to manage your listings.");
    }

    if (
      !window.confirm(
        `Are you sure you want to delete "${product.title}"?`
      )
    ) {
      return;
    }

    try {
      setMessage("");

      const response = await fetch(`${API_URL}/products/${product.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      await readResponse(response);

      setMessage("Product deleted successfully!");
      await fetchProducts(search, category);
    } catch (err) {
      setMessage(err.message || "Something went wrong.");
    }
  }

  function conversationTitle(conversation) {
    if (conversation.product_title) return conversation.product_title;
    if (conversation.title) return conversation.title;
    return `Conversation #${conversation.id}`;
  }

  function otherParticipant(conversation) {
    if (Number(conversation.buyer_id) === Number(user?.id)) {
      return conversation.seller_name || "Seller";
    }

    return conversation.buyer_name || "Buyer";
  }

  function messageSenderId(item) {
    return item.sender_id ?? item.user_id;
  }

  function messageSenderName(item) {
    if (Number(messageSenderId(item)) === Number(user?.id)) {
      return "You";
    }

    return item.sender_name || item.name || "Other user";
  }

  return (
    <main className="page">
      <header className="navbar">
        <a className="logo" href="/">
          Handoff<span>.</span>
        </a>

        <span className="tagline">A smarter way to pass it on.</span>

        {user ? (
          <div className="account-bar">
            <span>Hi, {user.name}</span>
            <button
              type="button"
              onClick={() => {
                document
                  .getElementById("handoff-inbox")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Inbox ({inbox.length})
            </button>
            <button type="button" onClick={logout}>
              Log out
            </button>
          </div>
        ) : (
          <span className="tagline">Log in to sell and manage listings</span>
        )}
      </header>

      {!user && (
        <section className="auth-section">
          <div>
            <p className="eyebrow">YOUR HANDOFF ACCOUNT</p>
            <h2>
              {authMode === "login"
                ? "Welcome back"
                : "Create your account"}
            </h2>
            <p>
              {authMode === "login"
                ? "Log in to publish and manage your listings."
                : "Join Handoff to give useful things a new home."}
            </p>
          </div>

          <form className="sell-form auth-form" onSubmit={handleAuth}>
            {authMode === "register" && (
              <input
                name="name"
                type="text"
                placeholder="Your name"
                maxLength={100}
                autoComplete="name"
                required
              />
            )}

            <input
              name="email"
              type="email"
              placeholder="Email address"
              maxLength={255}
              autoComplete="email"
              required
            />

            <input
              name="password"
              type="password"
              placeholder="Password (at least 8 characters)"
              minLength={8}
              maxLength={72}
              autoComplete={
                authMode === "login" ? "current-password" : "new-password"
              }
              required
            />

            <button type="submit" disabled={authBusy}>
              {authBusy
                ? "Please wait..."
                : authMode === "login"
                  ? "Log in"
                  : "Create account"}
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMode(
                  authMode === "login" ? "register" : "login"
                );
                setMessage("");
              }}
            >
              {authMode === "login"
                ? "Need an account? Register"
                : "Already have an account? Log in"}
            </button>
          </form>
        </section>
      )}

      {message && (
        <p className="status-message" role="status" aria-live="polite">
          {message}
        </p>
      )}

      <section className="hero">
        <p className="eyebrow">THE STUDENT MARKETPLACE</p>
        <h1>
          Good things deserve
          <br />
          a second life.
        </h1>
        <p className="hero-text">
          Discover affordable books, electronics and essentials from fellow
          students.
        </p>

        <div className="search-controls">
          <input
            className="search"
            type="search"
            placeholder="Search for books, calculators..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search products"
          />

          <select
            className="category-filter"
            aria-label="Filter by category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="All">All categories</option>
            <option value="Books">Books</option>
            <option value="Electronics">Electronics</option>
            <option value="Furniture">Furniture</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </section>

      <section className="products-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">EXPLORE</p>
            <h2>Available products</h2>
          </div>

          <span className="count">
            {loading
              ? "Searching..."
              : `${products.length} ${
                  products.length === 1 ? "product" : "products"
                }`}
          </span>
        </div>

        {(search.trim() || category !== "All") &&
          !loading &&
          !error && (
            <p className="search-results-message">
              Showing results
              {search.trim() && (
                <>
                  {" "}
                  for <strong>"{search.trim()}"</strong>
                </>
              )}
              {category !== "All" && (
                <>
                  {" "}
                  in <strong>{category}</strong>
                </>
              )}
            </p>
          )}

        {loading && <p className="status-message">Loading products...</p>}
        {!loading && error && <p className="error">{error}</p>}

        {!loading && !error && products.length === 0 && (
          <p>No products found. Try another search or category.</p>
        )}

        {!loading && !error && products.length > 0 && (
          <div className="product-grid">
            {products.map((product) => {
              const imageUrl =
                product.image_url ||
                (product.title.toLowerCase().includes("data science")
                  ? "https://m.media-amazon.com/images/I/71yGdJoAkbL._SL1500_.jpg"
                  : "");

              const isOwner =
                user &&
                Number(product.user_id) === Number(user.id);

              return (
                <article className="product-card" key={product.id}>
                  <div className="product-image">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={product.title}
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                          event.currentTarget.nextElementSibling.style.display =
                            "grid";
                        }}
                      />
                    ) : null}

                    <span
                      className="product-image-fallback"
                      style={{ display: imageUrl ? "none" : "grid" }}
                      aria-hidden="true"
                    >
                      {product.category === "Books"
                        ? "📚"
                        : product.category === "Electronics"
                          ? "💻"
                          : product.category === "Furniture"
                            ? "🪑"
                            : "🛍️"}
                    </span>
                  </div>

                  <div className="product-info">
                    <span className="category">{product.category}</span>
                    <h3>{product.title}</h3>

                    <p className="description">
                      {product.description || "No description provided."}
                    </p>

                    {product.seller_name && (
                      <p className="seller-name">
                        Seller: {product.seller_name}
                      </p>
                    )}

                    <div className="product-footer">
                      <strong>
                        ₹
                        {Number(product.price).toLocaleString("en-IN", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                      </strong>
                      <span>{product.condition}</span>
                    </div>

                    {isOwner ? (
                      <div className="product-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProduct(product);
                            setMessage("");
                          }}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(product)}
                        >
                          Delete
                        </button>
                      </div>
                    ) : (
                      <div className="product-actions">
                        <button
                          type="button"
                          disabled={!user}
                          title={
                            user
                              ? "Contact the seller"
                              : "Log in to contact the seller"
                          }
                          onClick={() => contactSeller(product)}
                        >
                          {user ? "Contact Seller" : "Log in to contact"}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Inbox and messaging window */}
      {user && (
        <section
          id="handoff-inbox"
          style={{
            margin: "40px 0",
            padding: "24px",
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            background: "#fff",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "20px",
            }}
          >
            <div>
              <p className="eyebrow">YOUR MESSAGES</p>
              <h2 style={{ margin: 0 }}>Inbox</h2>
            </div>

            <button type="button" onClick={loadInbox}>
              Refresh inbox
            </button>
          </div>

          {chatError && (
            <p className="error" role="alert">
              {chatError}
            </p>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px, 0.8fr) minmax(0, 1.5fr)",
              gap: "20px",
              alignItems: "start",
            }}
          >
            <div>
              {inbox.length === 0 ? (
                <p>
                  No conversations yet. Find a product and select{" "}
                  <strong>Contact Seller</strong> to start a conversation.
                </p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gap: "10px",
                    maxHeight: "500px",
                    overflowY: "auto",
                  }}
                >
                  {inbox.map((conversation) => {
                    const selected =
                      String(activeConversation?.id) ===
                      String(conversation.id);

                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => openConversation(conversation)}
                        style={{
                          textAlign: "left",
                          padding: "14px",
                          borderRadius: "10px",
                          border: selected
                            ? "2px solid #2563eb"
                            : "1px solid #e5e7eb",
                          background: selected ? "#eff6ff" : "#fff",
                          color: "#111827",
                          cursor: "pointer",
                          overflowWrap: "anywhere",
                        }}
                      >
                        <strong>
                          {conversationTitle(conversation)}
                        </strong>

                        <div
                          style={{
                            fontSize: "13px",
                            marginTop: "5px",
                            color: "#6b7280",
                          }}
                        >
                          With {otherParticipant(conversation)}
                        </div>

                        <div
                          style={{
                            fontSize: "13px",
                            marginTop: "7px",
                            color: "#4b5563",
                          }}
                        >
                          {conversation.last_message ||
                            conversation.last_message_body ||
                            "No messages yet"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                overflow: "hidden",
                minWidth: 0,
              }}
            >
              {!activeConversation ? (
                <div style={{ padding: "32px 20px", textAlign: "center" }}>
                  <h3>Select a conversation</h3>
                  <p>Choose a conversation from your inbox to view messages.</p>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      padding: "16px",
                      borderBottom: "1px solid #e5e7eb",
                      background: "#f9fafb",
                    }}
                  >
                    <h3 style={{ margin: 0 }}>
                      {conversationTitle(activeConversation)}
                    </h3>
                    <p style={{ margin: "5px 0 0", color: "#6b7280" }}>
                      Conversation with {otherParticipant(activeConversation)}
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        loadMessages(activeConversation.id, true)
                      }
                      style={{ marginTop: "10px" }}
                    >
                      Refresh messages
                    </button>
                  </div>

                  <div
                    style={{
                      padding: "16px",
                      height: "350px",
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      background: "#fafafa",
                    }}
                  >
                    {chatLoading && chatMessages.length === 0 && (
                      <p>Loading messages...</p>
                    )}

                    {!chatLoading && chatMessages.length === 0 && (
                      <p style={{ textAlign: "center", color: "#6b7280" }}>
                        No messages yet. Send the first message!
                      </p>
                    )}

                    {chatMessages.map((item) => {
                      const mine =
                        Number(messageSenderId(item)) === Number(user.id);

                      return (
                        <div
                          key={item.id}
                          style={{
                            alignSelf: mine ? "flex-end" : "flex-start",
                            maxWidth: "85%",
                            padding: "10px 13px",
                            borderRadius: "12px",
                            background: mine ? "#dbeafe" : "#fff",
                            border: "1px solid #e5e7eb",
                            overflowWrap: "anywhere",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#6b7280",
                              marginBottom: "5px",
                            }}
                          >
                            {messageSenderName(item)}
                          </div>

                          <div style={{ whiteSpace: "pre-wrap" }}>
                            {item.body}
                          </div>

                          {item.created_at && (
                            <div
                              style={{
                                fontSize: "11px",
                                color: "#6b7280",
                                marginTop: "6px",
                                textAlign: "right",
                              }}
                            >
                              {new Date(item.created_at).toLocaleString()}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div ref={messagesEndRef} />
                  </div>

                  <form
                    onSubmit={sendMessage}
                    style={{
                      padding: "12px",
                      borderTop: "1px solid #e5e7eb",
                      display: "flex",
                      gap: "8px",
                      alignItems: "stretch",
                    }}
                  >
                    <textarea
                      value={chatDraft}
                      onChange={(event) => setChatDraft(event.target.value)}
                      placeholder="Write a message..."
                      maxLength={2000}
                      rows={2}
                      required
                      aria-label="Write a message"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        resize: "vertical",
                        padding: "10px",
                        border: "1px solid #d1d5db",
                        borderRadius: "8px",
                        font: "inherit",
                      }}
                    />

                    <button
                      type="submit"
                      disabled={sendingMessage || !chatDraft.trim()}
                    >
                      {sendingMessage ? "Sending..." : "Send"}
                    </button>
                  </form>

                  <p
                    style={{
                      margin: "0 12px 12px",
                      fontSize: "12px",
                      color: "#6b7280",
                    }}
                  >
                    Messages are limited to 2,000 characters.
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {user && editingProduct && (
        <section className="edit-section">
          <h2>Edit product</h2>

          <form className="sell-form" onSubmit={handleUpdate}>
            <input
              name="title"
              defaultValue={editingProduct.title}
              maxLength={150}
              placeholder="Product title"
              required
            />

            <textarea
              name="description"
              defaultValue={editingProduct.description || ""}
              rows={3}
              placeholder="Product description"
            />

            <input
              name="image_url"
              type="url"
              defaultValue={editingProduct.image_url || ""}
              placeholder="Image URL (optional, https://...)"
            />

            <input
              name="price"
              type="number"
              defaultValue={editingProduct.price}
              min="0"
              max="99999999.99"
              step="0.01"
              placeholder="Price in ₹"
              required
            />

            <select
              name="category"
              defaultValue={editingProduct.category}
              required
            >
              <option value="Books">Books</option>
              <option value="Electronics">Electronics</option>
              <option value="Furniture">Furniture</option>
              <option value="Other">Other</option>
            </select>

            <select
              name="condition"
              defaultValue={editingProduct.condition}
              required
            >
              <option value="New">New</option>
              <option value="Like New">Like New</option>
              <option value="Used">Used</option>
            </select>

            <button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save changes"}
            </button>

            <button
              type="button"
              onClick={() => setEditingProduct(null)}
            >
              Cancel
            </button>
          </form>
        </section>
      )}

      <section className="sell-section">
        <div>
          <p className="eyebrow">GIVE IT A NEW HOME</p>
          <h2>Sell a product</h2>
          <p>
            {user
              ? "List something you no longer need."
              : "Log in or register above to publish a listing."}
          </p>
        </div>

        {user ? (
          <form className="sell-form" onSubmit={handleSubmit}>
            <input
              name="title"
              type="text"
              placeholder="Product title"
              maxLength={150}
              required
            />

            <textarea
              name="description"
              placeholder="Product description"
              rows={3}
            />

            <input
              name="image_url"
              type="url"
              placeholder="Image URL (optional, https://...)"
            />

            <input
              name="price"
              type="number"
              placeholder="Price in ₹"
              min="0"
              max="99999999.99"
              step="0.01"
              required
            />

            <select name="category" defaultValue="" required>
              <option value="" disabled>
                Select category
              </option>
              <option value="Books">Books</option>
              <option value="Electronics">Electronics</option>
              <option value="Furniture">Furniture</option>
              <option value="Other">Other</option>
            </select>

            <select name="condition" defaultValue="" required>
              <option value="" disabled>
                Select condition
              </option>
              <option value="New">New</option>
              <option value="Like New">Like New</option>
              <option value="Used">Used</option>
            </select>

            <button type="submit" disabled={submitting}>
              {submitting ? "Publishing..." : "Publish listing"}
            </button>
          </form>
        ) : (
          <p>Please log in to create a listing.</p>
        )}
      </section>

      <footer>Handoff © 2026 · Give useful things another life.</footer>

      <style>{`
        @media (max-width: 700px) {
          #handoff-inbox > div:last-child {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </main>
  );
}

export default App;
