import React, { useState } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import ChatWindow from "./ChatWindow";
import "./chat.css";

const ChatUI: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeSidebar = () => {
    setMobileOpen(false);
  };

  return (
    <div className="chat-app">
      <Header
        onMenu={() => setMobileOpen((open) => !open)}
      />

      <div className="chat-layout">
        <Sidebar
          onClose={closeSidebar}
        />

        {mobileOpen && (
          <button
            type="button"
            className="sidebar-overlay"
            onClick={closeSidebar}
            aria-label="Close sidebar"
          />
        )}

        <main className="chat-main">
          <ChatWindow />
        </main>
      </div>
    </div>
  );
};

export default ChatUI;