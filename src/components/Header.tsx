import React from "react";
import { usePrivy } from "@privy-io/react-auth";
import ThemeToggle from "./ThemeToggle";

const Header: React.FC<{ onMenu: () => void }> = ({ onMenu }) => {
  const { ready, authenticated, login, logout, user } = usePrivy();

  if (!ready) return null;

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (error) {
      console.warn("Sign out failed:", error);
    }
  };

  const displayName =
    user?.email?.address ||
    user?.google?.email ||
    user?.twitter?.username ||
    "Account";

  return (
    <header className="chat-header">
      {/* Left */}
      <div className="header-left">
        <button
          type="button"
          className="header-icon hamburger"
          onClick={onMenu}
          aria-label="Open menu"
        >
          <span />
          <span />
          <span />
        </button>

        <div className="agent-identity">
          <div className="agent-avatar">
            ✦
          </div>

          <div className="agent-info">
            <div className="agent-name">Sentinel</div>
            <div className="agent-status">
              <span className="status-dot" />
              Online
            </div>
          </div>
        </div>
      </div>

      {/* Right */}
      <div className="header-actions">
        <ThemeToggle />

        {authenticated ? (
          <div className="account">
            <div className="account-info">
              <span className="account-name">{displayName}</span>
              <span className="account-label">Connected</span>
            </div>

            {/* {user?.avatar ? (
              <img
                src={user.avatar}
                alt="Account avatar"
                className="avatar"
              />
            ) : (
              <div className="avatar avatar-fallback">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )} */}

            <button
              type="button"
              className="account-menu"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
            >
              ⋯
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="signin-button"
            onClick={() => login()}
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;