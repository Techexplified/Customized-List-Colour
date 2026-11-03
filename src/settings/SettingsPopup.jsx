import React, { useEffect, useState } from "react";
import {
  getCurrentMember,
  disconnectMember,
} from "../lib/trelloApi.js";
import { isAuthorized, BROADCAST_CHANNEL_NAME } from "../lib/auth.js";
import { SpinnerIcon, CheckIcon, PrismListEngineGraphic } from "../lib/icons.jsx";
import "./settings.css";

export default function SettingsPopup({ t }) {
  const [status, setStatus] = useState("checking"); // checking | connected | unauthenticated
  const [member, setMember] = useState(null);

  useEffect(() => {
    loadMemberProfile();

    let bc = null;
    try {
      bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      bc.onmessage = () => {
        loadMemberProfile();
      };
    } catch (e) {}

    function handleStorage(e) {
      if (e.key === "trello_token") {
        loadMemberProfile();
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      if (bc) bc.close();
    };
  }, []);

  async function loadMemberProfile() {
    setStatus("checking");
    try {
      const authed = await isAuthorized(t);
      if (!authed) {
        setStatus("unauthenticated");
        return;
      }

      const profile = await getCurrentMember(t);
      setMember(profile);
      setStatus("connected");
    } catch (err) {
      setMember(null);
      setStatus("unauthenticated");
    }
  }

  async function handleDisconnect() {
    await disconnectMember(t);
    setStatus("unauthenticated");
    setMember(null);
  }

  function handleReauthorize() {
    if (t && typeof t.popup === "function") {
      t.popup({
        title: "Authorize Conditional List Colors",
        url: "./auth.html",
        height: 380,
      });
    } else {
      window.location.href = "./auth.html";
    }
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

  if (status === "checking") {
    return (
      <div className="settings-container" style={{ textAlign: "center", padding: "32px 16px" }}>
        <SpinnerIcon width={24} height={24} />
        <p style={{ margin: "12px 0 0", fontSize: "13px", color: "var(--trello-text-subtle)" }}>
          Checking authorization…
        </p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="settings-container" style={{ textAlign: "center" }}>
        <div style={{ margin: "10px auto 14px", display: "flex", justifyContent: "center" }}>
          <PrismListEngineGraphic activeColor="#6366f1" width={100} height={70} />
        </div>
        <h3 className="settings-title">Not Authorized</h3>
        <p className="settings-subtitle" style={{ margin: "6px 0 16px" }}>
          Authorize Conditional List Colors to enable automatic list tinting, WIP limits, and custom rules.
        </p>
        <button
          type="button"
          onClick={handleReauthorize}
          className="settings-btn-reauth"
        >
          Authorize Conditional List Colors
        </button>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <div className="settings-header">
        {member?.avatarUrl ? (
          <img
            src={`${member.avatarUrl}/50.png`}
            alt={member.fullName}
            className="settings-avatar"
          />
        ) : (
          <div className="settings-avatar-fallback">
            {member?.initials || "CL"}
          </div>
        )}
        <div>
          <h3 className="settings-title">
            {member?.fullName || "Trello Member"}
          </h3>
          <p className="settings-subtitle">@{member?.username || "member"}</p>
        </div>
      </div>

      <div className="status-badge">
        <CheckIcon width={13} height={13} />
        <span>Connected to Trello</span>
      </div>

      <div className="settings-info-card">
        <div className="settings-info-row">
          <span className="settings-info-label">Power-Up</span>
          <span className="settings-info-value">Conditional List Colors</span>
        </div>
        <div className="settings-info-row">
          <span className="settings-info-label">Scope</span>
          <span className="settings-info-value">Read / Write</span>
        </div>
        <div className="settings-info-row">
          <span className="settings-info-label">Storage</span>
          <span className="settings-info-value">Member-Private</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleOpenRulesManager}
        className="settings-btn-primary"
      >
        Configure List Color Rules
      </button>

      <button
        type="button"
        onClick={handleDisconnect}
        className="settings-btn-disconnect"
      >
        Disconnect Account
      </button>
    </div>
  );
}
