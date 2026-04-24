"use client";

import { useState } from "react";
import {
  LanguagesIcon,
  MenuIcon,
  XIcon,
} from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { FileUpload } from "@/components/file-upload";
import { SubtitleTable } from "@/components/subtitle-table";
import { TranslationControls } from "@/components/translation-controls";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useHasHydrated } from "@/store";

export default function Home() {
  const hydrated = useHasHydrated();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle sidebar"
          >
            {mobileOpen ? (
              <XIcon className="size-5" />
            ) : (
              <MenuIcon className="size-5" />
            )}
          </Button>
          <LanguagesIcon className="size-5 text-primary" />
          <span className="font-semibold">Subtitle Translator</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            · Powered by Gemini
          </span>
        </div>
        <ThemeToggle />
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <aside
          className={`${
            mobileOpen ? "block" : "hidden"
          } absolute inset-y-0 left-0 z-20 w-[min(92vw,22rem)] border-r bg-background md:static md:block md:w-80 md:shrink-0`}
        >
          <Sidebar />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden p-4">
          {!hydrated ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : (
            <>
              <FileUpload />
              <TranslationControls />
              <div className="min-h-0 flex-1">
                <SubtitleTable />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
