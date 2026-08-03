/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained (hoox-sh)
 * SPDX-License-Identifier: Apache-2.0
 */

/** @jsxImportSource @opentui/react */
/**
 * AI Chat View — SSE streaming chat interface with the AI agent.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────┐
 *   │  AI CHAT                    [Model Selector ▼] │
 *   │─────────────────────────────────────────────────│
 *   │  [user] Hello                            10:30  │
 *   │  [bot]  Hi! How can I help?              10:30  │
 *   │                                                 │
 *   │  (streaming response appears here token-by-token)│
 *   │                                                 │
 *   │─────────────────────────────────────────────────│
 *   │  [Enter to send · Shift+Enter for newline]      │
 *   │  ┌───────────────────────────────────────────┐  │
 *   │  │ Type your message...                      │  │
 *   │  └───────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────┘
 *
 * Pattern established for the TUI feature-parity batch:
 *   - Pure function component, no props required
 *   - Subscribes to useUIStore (so SSE can disconnect when not active)
 *   - Uses agentChatStream() for SSE streaming
 *   - Wraps content in <ErrorBoundary viewName="AI Chat">
 *   - Chat history persisted under $HOME/.hoox/.tui-state/ (last 100 messages)
 *   - Loading states and error handling for SSE failures
 *   - Keyboard: Enter to send, Shift+Enter for newline
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Colors,
  ConnectionStatusColor,
  useUIStore,
} from "@hoox-sh/hoox-shared";
import { ErrorBoundary } from "../shared/error-boundary";
import { ViewHeader } from "../shared/view-header";
import {
  agentChatStream,
  type ChatMessage,
  AI_MODEL_OPTIONS,
  type AiModelOption,
} from "../../services/cli-bridge";
import {
  readJsonState,
  removeJsonState,
  TuiStateFiles,
  writeJsonState,
} from "../../services/tui-storage";

/** Maximum messages to retain on disk. */
const MAX_STORED_MESSAGES = 100;
/** Sentinel displayed while awaiting first token. */
const STREAMING_INDICATOR = "…";

/** Format an ISO timestamp as HH:MM for chat timestamps. */
function formatTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

// ─── Sub-component: Chat Message Row ─────────────────────────────────────────

interface MessageRowProps {
  message: ChatMessage;
}

function MessageRow({ message }: MessageRowProps) {
  const isUser = message.role === "user";
  const roleLabel = isUser ? "USER" : "BOT";
  const roleColor = isUser ? Colors.accent : Colors.info;

  return (
    <box
      flexDirection="row"
      gap={1}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={0}
      paddingBottom={0}
    >
      <text fg={roleColor} bold dim={isUser}>
        [{roleLabel}]
      </text>
      <text fg={isUser ? Colors.foreground : Colors["muted-foreground"]}>
        {message.content}
      </text>
      <text fg={Colors.muted} dim>
        {formatTime(message.timestamp)}
      </text>
    </box>
  );
}

// ─── Sub-component: Streaming Assistant Row ───────────────────────────────────

interface StreamingRowProps {
  content: string;
  active: boolean;
}

function StreamingRow({ content, active }: StreamingRowProps) {
  const displayText = content.length > 0 ? content : STREAMING_INDICATOR;
  return (
    <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1}>
      <text fg={Colors.info} bold dim>
        [BOT]
      </text>
      <text fg={Colors["muted-foreground"]}>{displayText}</text>
      {active && (
        <text fg={Colors.accent} dim>
          ▌
        </text>
      )}
    </box>
  );
}

// ─── Sub-component: Model Selector ───────────────────────────────────────────

interface ModelSelectorProps {
  selected: AiModelOption;
  onChange: (model: AiModelOption) => void;
}

function ModelSelector({ selected, onChange }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <box flexDirection="column">
      <text fg={Colors.accent} bold dim onMouseUp={() => setOpen((o) => !o)}>
        [{selected.label.toUpperCase()} ▼]
      </text>
      {open && (
        <box
          flexDirection="column"
          border={true}
          borderStyle="single"
          borderColor={Colors.border}
          backgroundColor={Colors.card}
        >
          {AI_MODEL_OPTIONS.map((opt) => (
            <text
              key={opt.id}
              fg={opt.id === selected.id ? Colors.accent : Colors.foreground}
              bold={opt.id === selected.id}
              dim={opt.id === selected.id}
              onMouseUp={() => {
                onChange(opt);
                setOpen(false);
              }}
            >
              {opt.id === selected.id ? "▸ " : "  "}
              {opt.label}
            </text>
          ))}
        </box>
      )}
    </box>
  );
}

// ─── Main AI Chat View ────────────────────────────────────────────────────────

/**
 * AiChatView — SSE streaming chat with the AI agent.
 *
 * Pattern for TUI AI chat:
 *   1. Pure function component, no required props
 *   2. Subscribes to `useUIStore.activeView` to disconnect SSE when not active
 *   3. Uses `agentChatStream()` for SSE streaming
 *   4. Wraps in <ErrorBoundary viewName="AI Chat">
 *   5. Chat history persisted under $HOME/.hoox/.tui-state/ (last 100 messages)
 *   6. Explicit empty/error states instead of throwing
 */
export function AiChatView() {
  const activeView = useUIStore((s) => s.activeView);
  const isActive = activeView === "ai-chat";

  // ── State ──────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [inputText, setInputText] = useState("");
  const [selectedModel, setSelectedModel] = useState<AiModelOption>(
    AI_MODEL_OPTIONS[0]
  );
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<
    "connected" | "reconnecting" | "disconnected" | null
  >(null);

  // Ref to track current stream's AbortController for cleanup
  const currentStreamRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load chat history from disk on mount ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await readJsonState<ChatMessage[]>(
        TuiStateFiles.chatHistory,
        []
      );
      if (cancelled) return;
      if (Array.isArray(stored)) {
        setMessages(stored.slice(-MAX_STORED_MESSAGES));
      }
      setHistoryReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Persist messages to disk whenever they change (after initial load) ────
  useEffect(() => {
    if (!historyReady) return;
    const trimmed = messages.slice(-MAX_STORED_MESSAGES);
    void writeJsonState(TuiStateFiles.chatHistory, trimmed);
  }, [messages, historyReady]);

  // ── SSE disconnect when view is not active ────────────────────────────────
  useEffect(() => {
    if (!isActive && currentStreamRef.current) {
      currentStreamRef.current.abort();
      currentStreamRef.current = null;
      setIsStreaming(false);
      setStreamingContent("");
    }
  }, [isActive]);

  // ── Scroll to bottom on new content ───────────────────────────────────────
  // We use a ref-based timeout to batch scroll updates during streaming
  const scheduleScroll = useCallback(() => {
    if (scrollRef.current) clearTimeout(scrollRef.current);
    scrollRef.current = setTimeout(() => {
      // OpenTUI scrollbox auto-scrolls; no explicit scroll needed
    }, 50);
  }, []);

  useEffect(() => {
    scheduleScroll();
  }, [messages, streamingContent, scheduleScroll]);

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    // Append user message immediately
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setStreamingContent("");
    setIsStreaming(true);
    setError(null);

    // Build the messages array for the API (last MAX_STORED_MESSAGES)
    const allMessages = [...messages, userMsg].slice(-MAX_STORED_MESSAGES);

    // Abort any existing stream
    if (currentStreamRef.current) {
      currentStreamRef.current.abort();
    }

    let assistantContent = "";

    const { abort: streamAbort, finished } = agentChatStream(
      {
        messages: allMessages,
        model: selectedModel.id,
        temperature: 0.7,
        maxTokens: 500,
      },
      process.env.HOOX_API_URL ?? "http://localhost:8787",
      process.env.HOOX_API_TOKEN ?? "",
      (token: string) => {
        assistantContent += token;
        setStreamingContent(assistantContent);
      },
      (status: "connected" | "reconnecting" | "disconnected") => {
        setStreamStatus(status);
      }
    );

    // Store the stream's AbortController for cancellation
    currentStreamRef.current = streamAbort;

    try {
      await finished;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled — expected
        return;
      }
      const msg = err instanceof Error ? err.message : "Chat stream failed";
      setError(msg);
    } finally {
      if (!streamAbort.signal.aborted) {
        // Stream completed normally — save assistant message
        if (assistantContent.length > 0) {
          const assistantMsg: ChatMessage = {
            role: "assistant",
            content: assistantContent,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }
      }
      setIsStreaming(false);
      setStreamingContent("");
      currentStreamRef.current = null;
    }
  }, [inputText, isStreaming, messages, selectedModel]);

  // ── Handle Enter key in text area ──────────────────────────────────────────
  // In OpenTUI, textarea onKeyDown receives keyboard events.
  // Enter without Shift = send; Enter with Shift = newline (no-op here).
  const handleInputKeyDown = useCallback(
    (event: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void sendMessage();
      }
    },
    [sendMessage]
  );

  // ── Auto-focus input when view becomes active ──────────────────────────────
  useEffect(() => {
    if (isActive) {
      // The input field would be focused via ref in browser — in OpenTUI
      // we just ensure the view renders with the input visible (no explicit focus API)
    }
  }, [isActive]);

  // ── Derived state ───────────────────────────────────────────────────────────
  const statusColor =
    streamStatus === "connected"
      ? ConnectionStatusColor.connected
      : streamStatus === "reconnecting"
        ? ConnectionStatusColor.reconnecting
        : streamStatus === "disconnected"
          ? ConnectionStatusColor.offline
          : Colors.muted;

  const statusLabel =
    streamStatus === "connected"
      ? "◉ connected"
      : streamStatus === "reconnecting"
        ? "◉ reconnecting"
        : streamStatus === "disconnected"
          ? "! disconnected"
          : "";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ErrorBoundary viewName="AI Chat">
      <box flexDirection="column" flexGrow={1} padding={1} gap={1}>
        <ViewHeader
          title="AI CHAT"
          showDivider={false}
          meta={
            <box flexDirection="row" gap={2} alignItems="center">
              {statusLabel ? (
                <text fg={statusColor} dim>
                  {statusLabel}
                </text>
              ) : null}
              <ModelSelector
                selected={selectedModel}
                onChange={setSelectedModel}
              />
            </box>
          }
        />

        {/* Error banner */}
        {error && (
          <box
            flexDirection="row"
            gap={1}
            border={true}
            borderStyle="single"
            borderColor={Colors.error}
            paddingLeft={1}
            paddingRight={1}
          >
            <text fg={Colors.error} bold>
              !
            </text>
            <text fg={Colors.error}>
              {error.length > 70 ? error.slice(0, 67) + "…" : error}
            </text>
          </box>
        )}

        {/* Message list */}
        <box
          flexDirection="column"
          flexGrow={1}
          border={true}
          borderStyle="single"
          borderColor={Colors.border}
        >
          {messages.length === 0 && !isStreaming ? (
            <box
              padding={1}
              justifyContent="center"
              alignItems="center"
              flexGrow={1}
            >
              <text fg={Colors.muted} dim>
                Start a conversation with the AI agent
              </text>
            </box>
          ) : (
            <scrollbox width="100%" flexGrow={1}>
              {/* Historical messages */}
              {messages.map((msg, i) => (
                <MessageRow key={i} message={msg} />
              ))}

              {/* Live streaming response */}
              {isStreaming && streamingContent.length === 0 && (
                <StreamingRow content="" active={true} />
              )}
              {isStreaming && streamingContent.length > 0 && (
                <StreamingRow content={streamingContent} active={true} />
              )}
            </scrollbox>
          )}
        </box>

        {/* Input hint */}
        <text fg={Colors.muted} dim>
          Enter to send · Shift+Enter for newline
        </text>

        {/* Input area */}
        <box
          flexDirection="row"
          gap={1}
          border={true}
          borderStyle="single"
          borderColor={isStreaming ? Colors.muted : Colors.border}
          paddingLeft={1}
          paddingRight={1}
          paddingTop={0}
          paddingBottom={0}
        >
          {/* Multi-line text input rendered as a box with onChange */}
          <textarea
            value={inputText}
            onChange={(val: string) => setInputText(val)}
            onKeyDown={handleInputKeyDown}
            placeholder="Type your message..."
            disabled={isStreaming}
            width="100%"
            height={3}
            transparent={false}
            backgroundColor={Colors.card}
            foregroundColor={Colors.foreground}
          />
        </box>

        {/* Send button */}
        <box flexDirection="row" justifyContent="flex-end">
          <text
            fg={isStreaming || !inputText.trim() ? Colors.muted : Colors.accent}
            bold={!isStreaming && !!inputText.trim()}
            dim={isStreaming || !inputText.trim()}
            onMouseUp={
              isStreaming || !inputText.trim()
                ? undefined
                : () => void sendMessage()
            }
          >
            {isStreaming ? " … " : " [SEND] "}
          </text>
        </box>

        {/* Clear history */}
        {messages.length > 0 && (
          <text
            fg={Colors.muted}
            dim
            onMouseUp={() => {
              setMessages([]);
              void removeJsonState(TuiStateFiles.chatHistory);
            }}
          >
            [CLEAR HISTORY]
          </text>
        )}
      </box>
    </ErrorBoundary>
  );
}
