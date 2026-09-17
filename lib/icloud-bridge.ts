import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

export const bridgeCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function bridgeOptionsResponse() {
  return new NextResponse(null, { status: 204, headers: bridgeCorsHeaders });
}

export function withBridgeCors(response: NextResponse) {
  for (const [name, value] of Object.entries(bridgeCorsHeaders)) response.headers.set(name, value);
  return response;
}

export function authorizeIcloudBridge(request: Request) {
  const configuredToken = getEnv().ICLOUD_BRIDGE_TOKEN;
  if (!configuredToken || configuredToken.length < 32) {
    return NextResponse.json(
      { error: "本地同步助手未配置 ICLOUD_BRIDGE_TOKEN" },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization") || "";
  const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expected = Buffer.from(configuredToken, "utf8");
  const supplied = Buffer.from(suppliedToken, "utf8");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return NextResponse.json({ error: "本地同步密钥无效" }, { status: 401 });
  }
  return null;
}
