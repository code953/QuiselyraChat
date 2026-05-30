"use client";

import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ProviderSettings } from "@/components/settings/provider-settings";
import { ModelSettings } from "@/components/settings/model-settings";
import { PersonaSettings } from "@/components/settings/persona-settings";
import { GeneralSettings } from "@/components/settings/general-settings";

function SettingsLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">设置</h1>
      </header>

      <Tabs defaultValue="providers" className="flex-1 overflow-hidden">
        <div className="border-b px-4">
          <TabsList className="h-10">
            <TabsTrigger value="providers">服务商</TabsTrigger>
            <TabsTrigger value="models">模型</TabsTrigger>
            <TabsTrigger value="personas">人格</TabsTrigger>
            <TabsTrigger value="general">通用</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="providers" className="p-4">
            <ProviderSettings />
          </TabsContent>
          <TabsContent value="models" className="p-4">
            <ModelSettings />
          </TabsContent>
          <TabsContent value="personas" className="p-4">
            <PersonaSettings />
          </TabsContent>
          <TabsContent value="general" className="p-4">
            <GeneralSettings />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default function SettingsClient() {
  return (
    <AuthGuard>
      <SettingsLayout />
    </AuthGuard>
  );
}
