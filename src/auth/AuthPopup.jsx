import React, { useEffect, useRef, useState } from "react";
import {
  APP_NAME,
  AUTH_MESSAGE_SOURCE,
  BROADCAST_CHANNEL_NAME,
  buildAuthorizeUrl,
  saveToken,
  getToken,
  clearToken,
} from "../lib/auth.js";
import {
  PrismListEngineGraphic,
  ShieldLockIcon,
  SparkleWandIcon,
  ZapIcon,
  CheckIcon,
  SpinnerIcon,
} from "../lib/icons.jsx";
import "./auth.css";

const PREVIEW_THEMES = [
  { id: "overdue", name: "Overdue", color: "#e34935" },
  { id: "urgent", name: "Urgent", color: "#8270db" },
  { id: "checklist", name: "Checklist", color: "#d97008" },
  { id: "completed", name: "Completed", color: "#1f845a" },
];

export default function AuthPopup({ t }) {
  const [status, setStatus] = useState("idle"); // idle | waiting | success | error
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTheme, setActiveTheme] = useState(PREVIEW_THEMES[0]);
  const [showDetails, setShowDetails] = useState(false);
  const popupRef = useRef(null);

  // Check initial token status on mount (respects Trello "Remove personal data")
  useEffect(() => {
    async function checkInitialToken() {
      const existingToken = await getToken(t);
      if (existingToken) {
        setStatus("success");
      } else {
        setStatus("idle");
      }
    }
    checkInitialToken();
  }, [t]);

  // Listen for authorization messages from popup window
  useEffect(() => {
    async function handleToken(token) {
      if (!token) return;
      try {
        await saveToken(t, token);
        setStatus("success");
      } catch (err) {
        setStatus("error");
        setErrorMessage(
          "Failed to store authorization credentials: " +
            (err.message || "Unknown error")
        );
      }
    }

    async function handleMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.source !== AUTH_MESSAGE_SOURCE) return;

      if (!event.data.token) {
        setStatus("error");
        setErrorMessage("No authorization token was received from Trello.");
        return;
      }

      await handleToken(event.data.token);
    }

    // BroadcastChannel support
    let bc = null;
    try {
      bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      bc.onmessage = (event) => {
        if (event.data && event.data.token) {
          handleToken(event.data.token);
        }
      };
    } catch (e) {}

    // Storage event support
    function handleStorage(e) {
      if (e.key === "trello_token" && e.newValue) {
        handleToken(e.newValue);
      }
    }

    window.addEventListener("message", handleMessage);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
      if (bc) bc.close();
    };
  }, [t]);

  // Dynamically resize Trello popup container
  useEffect(() => {
    if (t && typeof t.sizeTo === "function") {
      t.sizeTo("#root").catch(() => {});
    }
  }, [t, status, showDetails]);

  function handleAuthorize() {
    setStatus("waiting");
    setErrorMessage("");

    const returnUrl = `${window.location.origin}/authorized.html`;
    const authUrl = buildAuthorizeUrl(returnUrl);

    const width = 580;
    const height = 750;

    const screenWidth =
      window.screen?.availWidth || window.screen?.width || 1280;
    const screenHeight =
      window.screen?.availHeight || window.screen?.height || 800;

    const left = Math.max(0, Math.round((screenWidth - width) / 2));
    const top = Math.max(0, Math.round((screenHeight - height) / 2));

    popupRef.current = window.open(
      authUrl,
      "trelloAuthPopup",
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
    );

    if (
      !popupRef.current ||
      popupRef.current.closed ||
      typeof popupRef.current.closed === "undefined"
    ) {
      setStatus("error");
      setErrorMessage(
        "Popup was blocked by your browser. Please allow popups for this site and click Try Again."
      );
    }
  }

  // Instant simulator for local testing
  function handleSimulateSuccess() {
    setStatus("waiting");
    setTimeout(async () => {
      const mockToken = "mock_trello_token_" + Date.now();
      await saveToken(t, mockToken);
      setStatus("success");
    }, 700);
  }

  async function handleOpenRulesManager() {
    let listNames = [];
    try {
      if (t && typeof t.lists === "function") {
        const boardLists = await t.lists("all");
        if (Array.isArray(boardLists) && boardLists.length > 0) {
          listNames = boardLists.map((l) => l.name).filter(Boolean);
        }
      }
    } catch (e) {}

    const query =
      listNames.length > 0
        ? `?lists=${encodeURIComponent(JSON.stringify(listNames))}`
        : "";

    if (t && typeof t.modal === "function") {
      t.modal({
        url: `./rules.html${query}`,
        accentColor: "#22272b",
        fullscreen: false,
        height: 640,
        width: 1020,
        title: "Conditional List Color Rule Studio",
      });
    } else {
      window.location.href = `./rules.html${query}`;
    }
    if (t && typeof t.closePopup === "function") {
      t.closePopup();
    }
  }

  function handleClose() {
    if (t && typeof t.closePopup === "function") {
      t.closePopup();
    }
  }

  async function handleDisconnectAndReauth() {
    await clearToken(t);
    setStatus("idle");
    setErrorMessage("");
  }

  // Success view with celebratory feedback
  if (status === "success") {
    return (
      <div className="auth-popup-container">
        <div className="auth-success-circle">
          <CheckIcon width={30} height={30} />
        </div>
        <h3 className="auth-title">Connected to {APP_NAME}</h3>
        <p className="auth-subtitle" style={{ marginBottom: "20px" }}>
          Your Trello board is now ready to apply conditional top banners based on due dates, checklists, and priorities.
        </p>

        <button
          type="button"
          onClick={handleOpenRulesManager}
          className="auth-btn-primary"
        >
          <SparkleWandIcon width={16} height={16} />
          <span>Configure List Colors</span>
        </button>

        <button
          type="button"
          onClick={handleDisconnectAndReauth}
          className="auth-toggle-link"
          style={{ marginTop: "14px", color: "#f87171" }}
        >
          Re-authorize / Change Account
        </button>

        <button
          type="button"
          onClick={handleClose}
          className="auth-toggle-link"
          style={{ marginTop: "8px" }}
        >
          Close &amp; Return to Board
        </button>
      </div>
    );
  }

  return (
    <div className="auth-popup-container">
      {/* Brand Identity Badge */}
      <div className="auth-brand-badge">
        <ZapIcon width={12} height={12} />
        <span>Trello Power-Up</span>
      </div>

      {/* Main Header Title */}
      <h3 className="auth-title">{APP_NAME}</h3>

      {/* Hero Subtitle */}
      <p className="auth-subtitle">
        Automatically highlight overdue cards, checklists, and priority work with top banner colors.
      </p>

      {/* Bespoke Interactive Chromatic Engine Visual */}
      <div
        className={`auth-hero-visual ${
          status === "waiting" ? "is-waiting" : ""
        }`}
      >
        <PrismListEngineGraphic
          activeColor={activeTheme.color}
          width={130}
          height={90}
        />
      </div>

      {/* Interactive Theme Switcher Pills */}
      <div className="auth-theme-pills">
        {PREVIEW_THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            className={`theme-pill-btn ${
              activeTheme.id === theme.id ? "is-active" : ""
            }`}
            onClick={() => setActiveTheme(theme)}
            title={`Preview ${theme.name} palette`}
          >
            <span
              className="theme-dot"
              style={{ backgroundColor: theme.color }}
            />
            <span>{theme.name}</span>
          </button>
        ))}
      </div>

      {/* Error Banner */}
      {status === "error" && (
        <div className="auth-error-banner">
          {errorMessage ||
            "Unable to connect with Trello. Please ensure popups are permitted."}
        </div>
      )}

      {/* Elevated Gradient Action Button */}
      <button
        type="button"
        onClick={handleAuthorize}
        disabled={status === "waiting"}
        className="auth-btn-primary"
        id="btn-auth-connect"
      >
        {status === "waiting" ? (
          <>
            <SpinnerIcon width={16} height={16} />
            Waiting for approval…
          </>
        ) : status === "error" ? (
          "Try Again"
        ) : (
          <>
            <SparkleWandIcon width={16} height={16} />
            <span>Connect with Trello</span>
          </>
        )}
      </button>

      {/* Waiting Status Feedback */}
      {status === "waiting" && (
        <div className="auth-waiting-box">
          <div>
            <span className="dot-pulse" />
            Complete authorization in the opened Trello window.
          </div>
          <button
            type="button"
            onClick={handleAuthorize}
            className="auth-action-link"
          >
            Re-open authorization popup
          </button>
          <button
            type="button"
            onClick={() => setStatus("idle")}
            className="auth-action-link"
            style={{ color: "var(--pu-text-muted)", fontSize: "11px" }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Trust & Privacy Reassurance */}
      <div className="auth-trust-row">
        <div className="trust-badge-item">
          <ShieldLockIcon width={13} height={13} />
          <span>Member-Private</span>
        </div>
        <div className="trust-badge-item">
          <ZapIcon width={13} height={13} />
          <span>Zero External Storage</span>
        </div>
      </div>

      {/* Interactive Accordion for Feature Transparency */}
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className="auth-toggle-link"
      >
        {showDetails ? "Hide rule details" : "How conditional rules work"}
      </button>

      {showDetails && (
        <div className="auth-feature-drawer">
          <div className="auth-feature-row">
            <span>📅</span>
            <span>
              <strong>Due Dates:</strong> Flag overdue cards and upcoming deadlines with colored banners.
            </span>
          </div>
          <div className="auth-feature-row">
            <span>☑️</span>
            <span>
              <strong>Checklists:</strong> Highlight cards with incomplete tasks or celebrate 100% completion.
            </span>
          </div>
          <div className="auth-feature-row">
            <span>⚡</span>
            <span>
              <strong>Priority:</strong> Automatically style Urgent, High, Medium, or Low priority tasks.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
