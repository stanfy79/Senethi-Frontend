import React from "react";
import { usePrivy } from "@privy-io/react-auth";
import ThemeToggle from "./ThemeToggle";

const Header: React.FC<{ onMenu: () => void }> = ({ onMenu }) => {
  const { ready, authenticated, login, user } = usePrivy();

  if (!ready) return null;

  const displayName =
    user?.email?.address ||
    user?.wallet?.address.substring(0, 6) + "..." + user?.wallet?.address.substring(user?.wallet?.address.length - 6) ||
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
            <div className="agent-name">Senethi</div>
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