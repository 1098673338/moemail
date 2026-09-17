import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}

const nextConfig = {
  serverExternalPackages: ["imapflow", "sanitize-html"],
};

export default nextConfig;
