import { usePrivy } from "@privy-io/react-auth";
import React, { useEffect, useRef, useState } from "react";
import axios from "axios";

type Message = {
  id: string;
  from: "user" | "assistant";
  text: string;
};

const ChatWindow: React.FC = () => {
  const { ready, authenticated, login } = usePrivy();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "m1",
      from: "assistant",
      text: "Hello — how can I help you today? You can send transactions (Send 1 usdc to 0xb0A45280a68343Ad8c28EB7ca1b15B64720287C7), check your wallet balance (my balance), and more. Just ask!",
    },
  ]);

  const [text, setText] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;

    if (el) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isTyping]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();

    try {
      if (!ready || !authenticated) login();

      const content = text.trim();

      if (!content || isTyping) return;


      const userMsg: Message = {
        id: `u-${Date.now()}`,
        from: "user",
        text: content,
      };

      setMessages((current) => [...current, userMsg]);
      setText("");
      setIsTyping(true);

      setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          from: "assistant",
          text: "Processing your request... This may take a few seconds.",
        },
      ]);
    }, 1000);

      const response = await axios.post(
        `${import.meta.env.VITE_BASE_URL}/v1/agent/run`,
        {
          message: content,
        },
      );
      
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          from: "assistant",
          text: `${response.data.response.message}`,
        },
      ]);
      setIsTyping(false);

    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          from: "assistant",
          text: `${error instanceof Error ? error.message : "An error occurred while sending the message."}`,
        },
      ]);
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <main className="chat-window">
      {/* Messages */}
      <div className="messages" ref={containerRef}>
        <div className="messages-inner">
          {messages.map((message) => (
            <div key={message.id} className={`message-row ${message.from}`}>
              {message.from === "assistant" && (
                <div className="message-avatar">✦</div>
              )}

              <div className="message-content">
                <div className="message-label">
                  {message.from === "assistant" ? "Senethi" : "You"}
                </div>

                <div className="message-text">{message.text}</div>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="message-row assistant">
              <div className="message-avatar">✦</div>

              <div className="message-content">
                <div className="message-label">Senethi</div>

                <div className="typing-indicator">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="composer-wrapper">
        <form className="composer" onSubmit={send}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Senethi..."
            rows={1}
          />

          <div className="composer-bottom">
            <div className="composer-hint">
              <span>↵</span>
              Send
              <span className="hint-divider">·</span>
              <span>Shift + ↵</span>
              New line
            </div>

            <button
              type="submit"
              className="send-button"
              disabled={!text.trim() || isTyping}
              aria-label="Send message"
            >
              ↑
            </button>
          </div>
        </form>

        <div className="composer-disclaimer">
          Senethi can make mistakes. Verify important information.
        </div>
      </div>
    </main>
  );
};

export default ChatWindow;
