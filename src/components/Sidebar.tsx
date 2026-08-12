import { usePrivy } from "@privy-io/react-auth";
import React from "react";

const conversations = [
  {
    title: "General",
    meta: "AI Assistant",
    active: true,
  },
  {
    title: "Planner",
    meta: "Agent planning",
  },
  {
    title: "Treasury",
    meta: "Onchain tools",
  },
];

const Sidebar: React.FC<{}> = () => {
  const { ready, authenticated, login, logout } = usePrivy();

  if (!ready) return null;

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (error) {
      console.warn("Sign out failed:", error);
    }
  };

  return (
    <aside className="chat-sidebar">

      {/* Search */}
      <div className="sidebar-search">
        <span className="search-icon">⌕</span>
        <input
          type="search"
          placeholder="Search chats"
          aria-label="Search conversations"
        />
        <kbd>⌘ F</kbd>
      </div>

      {/* Conversations */}
      <div className="conversation-section">
        <div className="section-label">Conversations</div>

        <ul className="convo-list">
          {conversations.map((conversation) => (
            <li
              key={conversation.title}
              className={`convo ${conversation.active ? "active" : ""}`}
            >
              <div className="convo-icon">
                {conversation.active ? "✦" : "○"}
              </div>

              <div className="convo-content">
                <div className="convo-title">{conversation.title}</div>
                <div className="convo-meta">{conversation.meta}</div>
              </div>

              <button
                type="button"
                className="convo-more"
                aria-label={`More options for ${conversation.title}`}
              >
                ···
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Bottom */}
      <div className="sidebar-footer">
          {authenticated ? (
            <button
              type="button"
              className="signin-button"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
            >
              Sign out
            </button>
        ) : (
          <button
            type="button"
            className="signin-button"
            onClick={() => login()}
          >
            Sign in
          </button>
        )}

        <div className="agent-status">
          <span className="status-dot" />
          <div>
            <strong>Sentinel AI</strong>
            <small>Online</small>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;