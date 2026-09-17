import { z } from "zod";
import { ADDRESS_STATUSES } from "@/lib/types";

const addressAccountTagsSchema = z.array(z.string().trim().min(1, "标签名称不能为空").max(24, "标签名称不能超过 24 个字符")).max(1, "每个邮箱地址只能设置一个标签");
const tagColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "请选择有效的标签颜色").nullable().optional();
const phoneUrlSchema = z.string().trim().max(2048, "链接不能超过 2048 个字符").refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}, "请输入以 http:// 或 https:// 开头的有效链接");

export const updateAddressSchema = z.object({
  label: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  providerLabel: z.string().trim().max(500).nullable().optional(),
  phoneNumber: z.string().trim().max(50, "手机号不能超过 50 个字符").nullable().optional(),
  phoneUrl: phoneUrlSchema.nullable().optional(),
  tags: addressAccountTagsSchema.optional(),
  tagColor: tagColorSchema,
  status: z.enum(ADDRESS_STATUSES).optional(),
  addedAt: z.coerce.date().nullable().optional(),
  providerCreatedAt: z.coerce.date().nullable().optional(),
});

export const connectIcloudSchema = z.object({
  emailAddress: z.email().transform((value) => value.trim().toLowerCase()),
  username: z.string().trim().min(1).max(320),
  appPassword: z.string().min(8).max(128),
});

const icloudAliasSnapshotItemSchema = z.object({
  address: z.email("地址清单中包含无效邮箱")
    .transform((value) => value.trim().toLowerCase()),
  providerId: z.string().trim().min(1, "缺少 Apple 地址标识").max(200),
  status: z.literal("active"),
  providerLabel: z.string().trim().max(500).nullable().optional(),
  providerOrigin: z.string().trim().max(200).nullable().optional(),
  providerCreatedAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const icloudAliasSnapshotSchema = z.object({
  authoritative: z.literal(true),
  scope: z.literal("active"),
  aliases: z.array(icloudAliasSnapshotItemSchema)
    .max(2000, "一次最多同步 2000 个地址"),
}).superRefine(({ aliases }, context) => {
  const addresses = new Set<string>();
  const providerIds = new Set<string>();
  for (const [index, alias] of aliases.entries()) {
    if (addresses.has(alias.address)) {
      context.addIssue({ code: "custom", message: `地址清单中存在重复邮箱：${alias.address}`, path: ["aliases", index, "address"] });
    }
    if (providerIds.has(alias.providerId)) {
      context.addIssue({ code: "custom", message: `地址清单中存在重复 Apple 标识：${alias.providerId}`, path: ["aliases", index, "providerId"] });
    }
    addresses.add(alias.address);
    providerIds.add(alias.providerId);
  }
});
