"use client";

import { useState, type FormEvent } from "react";

function safeNextPath() {
  const candidate = new URLSearchParams(window.location.search).get("next") || "/";
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return "/";
  try {
    const target = new URL(candidate, window.location.origin);
    if (target.origin !== window.location.origin || target.pathname === "/login") return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || `登录失败（HTTP ${response.status}）`);
      window.location.replace(safeNextPath());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败，请重试");
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand-mark" aria-hidden="true">@</div>
        <h1 id="login-title">登录 Mailbox</h1>
        <p className="login-description">输入部署时配置的登录密钥，继续管理 iCloud 邮箱。</p>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="login-password">登录密钥</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="button primary login-submit" type="submit" disabled={submitting || !password}>
            {submitting ? "正在登录…" : "登录"}
          </button>
        </form>
      </section>
    </main>
  );
}
