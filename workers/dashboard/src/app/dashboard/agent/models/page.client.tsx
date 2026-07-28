"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModelConfig } from "@/components/agent/model-config";
import { HealthCheck } from "@/components/agent/health-check";
import { TestModel } from "@/components/agent/test-model";
import { PageHeader } from "@/components/dashboard/page-header";
import { Settings } from "lucide-react";

export default function ModelsClient() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Settings className="h-8 w-8 text-primary" />}
        title="AI Models"
        description="Provider configuration and testing"
      />
      <Tabs defaultValue="config" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="config">Provider Config</TabsTrigger>
          <TabsTrigger value="health">Health Check</TabsTrigger>
          <TabsTrigger value="test">Test Model</TabsTrigger>
        </TabsList>
        <TabsContent value="config" className="mt-4">
          <ModelConfig />
        </TabsContent>
        <TabsContent value="health" className="mt-4">
          <HealthCheck />
        </TabsContent>
        <TabsContent value="test" className="mt-4">
          <TestModel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
