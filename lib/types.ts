export const ADDRESS_TYPES = ["icloud_primary", "icloud_hide"] as const;
export type AddressType = (typeof ADDRESS_TYPES)[number];

export const ADDRESS_STATUSES = [
  "active",
  "disabled",
  "pending_delete",
  "deleted",
  "sync_error",
] as const;
export type AddressStatus = (typeof ADDRESS_STATUSES)[number];

export type AccountStatus = "active" | "disabled" | "sync_error";

export interface MailAddressDto {
  id: string;
  address: string;
  type: AddressType;
  status: AddressStatus;
  provider: "icloud";
  providerId: string | null;
  providerLabel: string | null;
  providerOrigin: string | null;
  accountId: string | null;
  label: string | null;
  note: string | null;
  phoneNumber: string | null;
  phoneUrl: string | null;
  tags: string[];
  tagColor: string | null;
  addedAt: string | null;
  createdAt: string;
  providerCreatedAt: string | null;
  lastReceivedAt: string | null;
  disabledAt: string | null;
  deletedAt: string | null;
  messageCount: number;
}

export interface MailMessageDto {
  id: string;
  source: "icloud";
  senderAddress: string;
  senderName: string | null;
  recipients: string[];
  subject: string;
  textBody: string;
  htmlBody: string | null;
  receivedAt: string;
  isRead: boolean;
  addressIds: string[];
}

export interface ICloudAccountDto {
  id: string;
  emailAddress: string;
  username: string;
  status: AccountStatus;
  uidValidity: string | null;
  lastUid: number;
  lastSyncAt: string | null;
  aliasesLastSyncAt: string | null;
  aliasesActiveCount: number;
  aliasesInactiveCount: number;
  syncError: string | null;
  createdAt: string;
}
