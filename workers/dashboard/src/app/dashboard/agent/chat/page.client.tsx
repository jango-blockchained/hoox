"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatInterface } from "@/components/agent/chat-interface";
import { PageHeader } from "@/components/dashboard/page-header";
import { MessageSquare } from "lucide-react";

export default function ChatClient() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<MessageSquare className="h-8 w-8 text-primary" />}
        title="AI Chat"
        description="Chat with the AI agent using SSE streaming"
      />

      <ChatInterface />
    </div>
  );
}
