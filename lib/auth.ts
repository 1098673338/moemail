import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { SESSION_COOKIE } from "@/lib/auth-constants";

export { SESSION_COOKIE } from "@/lib/auth-constants";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const encoder = new TextEncoder();

function loginSecret() {
  const secret = getEnv().DASHBOARD_LOGIN_SECRET;
  return typeof secret === "string" && secret.length >= 32 ? secret : null;
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function signature(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

function readCookie(request: Request, name: string) {
  const prefix = `${name}=`;
  return request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

export async function createDashboardSession(secret = loginSecret()) {
  if (!secret) throw new Error("DASHBOARD_LOGIN_SECRET 未配置或长度不足");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = encodeBase64Url(encoder.encode(JSON.stringify({ exp: expiresAt, nonce: crypto.randomUUID() })));
  return `${payload}.${encodeBase64Url(await signature(payload, secret))}`;
}

export async function isValidDashboardSession(value: string | undefined, secret = loginSecret()) {
  if (!value || !secret || value.length > 2048) return false;
  const [payload, encodedSignature, extra] = value.split(".");
  if (!payload || !encodedSignature || extra !== undefined) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(encodedSignature),
      encoder.encode(payload),
    );
    if (!validSignature) return false;
    const session = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as { exp?: unknown; nonce?: unknown };
    return typeof session.exp === "number" && session.exp > Math.floor(Date.now() / 1000) && typeof session.nonce === "string";
  } catch {
    return false;
  }
}

export async function isRequestAuthenticated(request: Request) {
  return isValidDashboardSession(readCookie(request, SESSION_COOKIE));
}

export function isLoginSecretConfigured() {
  return loginSecret() !== null;
}

export async function verifyLoginSecret(candidate: string) {
  const secret = loginSecret();
  if (!secret || candidate.length > 512) return false;
  const [expected, actual] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(secret)),
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
  ]);
  const left = new Uint8Array(expected);
  const right = new Uint8Array(actual);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function requireDashboardSession(request: Request) {
  if (!loginSecret()) {
    return NextResponse.json(
      { error: "服务尚未配置登录密钥", code: "auth_not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!(await isRequestAuthenticated(request))) {
    return NextResponse.json(
      { error: "登录状态已失效，请重新登录", code: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!new Set(["GET", "HEAD", "OPTIONS"]).has(request.method.toUpperCase()) && !isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "请求来源无效", code: "invalid_origin" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return null;
}

export function sessionCookie(request: Request, value: string, maxAge = SESSION_TTL_SECONDS) {
  const secure = process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:";
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}
