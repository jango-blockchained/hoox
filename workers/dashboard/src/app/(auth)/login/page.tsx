"use client";

/**
 * Copyright (c) 2026 HOOX · HOOX · jango-blockchained
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, Terminal } from "lucide-react";
import { Key, Lock, Shield, User } from "reicon-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Credentials are validated server-side against configured auth settings.
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setError("Invalid credentials");
      }
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const hasError = Boolean(error);

  return (
    <div
      className={cn(
        "bg-background text-foreground relative flex min-h-screen items-center justify-center overflow-hidden p-4"
      )}
    >
      {/* Ambient background glow (decorative) */}
      <div className="bg-primary/10 pointer-events-none absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]" />
      <div className="bg-primary/5 pointer-events-none absolute top-0 right-0 h-[400px] w-[400px] rounded-full blur-[100px]" />

      {/* Grid pattern overlay (decorative) */}
      <div className="pointer-events-none absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="bg-card/80 border-border overflow-hidden rounded-xl shadow-2xl backdrop-blur-xl">
          <div className="from-primary/0 via-primary/50 to-primary/0 absolute inset-x-0 top-0 h-px bg-gradient-to-r" />

          <CardHeader className="flex flex-col gap-3 pb-6 text-center">
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="border-border bg-muted/30 mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl border shadow-inner"
            >
              <Terminal className="text-primary h-6 w-6" />
            </motion.div>
            <CardTitle className="bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              Hoox Gateway
            </CardTitle>
            <CardDescription className="text-muted-foreground font-medium">
              Authenticate to access the command center
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-5"
              noValidate
            >
              <FieldGroup
                data-invalid={hasError || undefined}
                data-disabled={loading || undefined}
                className="flex flex-col gap-5"
              >
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                  >
                    <Alert variant="destructive" className="text-destructive">
                      <Shield />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}

                <Field data-disabled={loading || undefined}>
                  <FieldLabel
                    htmlFor="username"
                    className="text-muted-foreground text-xs font-semibold uppercase tracking-wider"
                  >
                    Username
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <User />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="username"
                      type="text"
                      placeholder="admin"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      aria-invalid={hasError || undefined}
                      disabled={loading}
                      required
                    />
                  </InputGroup>
                </Field>

                <Field data-disabled={loading || undefined}>
                  <FieldLabel
                    htmlFor="password"
                    className="text-muted-foreground text-xs font-semibold uppercase tracking-wider"
                  >
                    Password
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <Lock />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      aria-invalid={hasError || undefined}
                      disabled={loading}
                      required
                    />
                  </InputGroup>
                  <FieldDescription>
                    <a
                      href="#"
                      className="hover:text-foreground text-muted-foreground"
                    >
                      Forgot your password?
                    </a>
                  </FieldDescription>
                </Field>

                <Field className="pt-2">
                  <Button
                    type="submit"
                    className="h-11 w-full"
                    disabled={loading}
                    aria-busy={loading || undefined}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Authenticating...
                      </>
                    ) : (
                      <>
                        Access System
                        <ArrowRight className="opacity-70" />
                      </>
                    )}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        {/* Footer: trust badges + secured-by line */}
        <div className="mt-6 flex flex-col items-center justify-center gap-2">
          <div className="text-muted-foreground flex items-center justify-center gap-3">
            <div className="border-border bg-muted/30 flex items-center gap-1 rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-widest">
              <Shield className="text-success h-3 w-3" />
              <span>Zero Trust</span>
            </div>
            <div className="border-border bg-muted/30 flex items-center gap-1 rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-widest">
              <Lock className="text-primary h-3 w-3" />
              <span>End-to-End</span>
            </div>
            <div className="border-border bg-muted/30 flex items-center gap-1 rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-widest">
              <Key className="text-primary h-3 w-3" />
              <span>Edge Auth</span>
            </div>
          </div>
          <p className="text-muted-foreground text-center font-mono text-[10px] uppercase tracking-widest">
            Secured by Cloudflare Infrastructure
          </p>
        </div>
      </motion.div>
    </div>
  );
}
