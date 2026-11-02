import React from "react";
import ReactDOM from "react-dom/client";
import RulesModal from "./RulesModal.jsx";

let t = null;
try {
  if (typeof window !== "undefined" && window.TrelloPowerUp && typeof window.TrelloPowerUp.iframe === "function") {
    t = window.TrelloPowerUp.iframe();
  }
} catch (e) {
  t = null;
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
      console.error("RulesModal render error:", error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "24px",
            color: "#f87171",
            background: "#22272b",
            fontFamily: "-apple-system, sans-serif",
            height: "100%",
            boxSizing: "border-box",
          }}
        >
          <h3 style={{ margin: "0 0 10px", fontSize: "16px", color: "#f1f5f9" }}>
            Rule Studio Encountered an Error
          </h3>
          <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#94a3b8" }}>
            {this.state.error?.message || "Unknown error occurred"}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "6px 14px",
              background: "#0c66e4",
              color: "#ffffff",
              border: "none",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Reload Studio
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RulesModal t={t} />
    </ErrorBoundary>
  </React.StrictMode>
);
