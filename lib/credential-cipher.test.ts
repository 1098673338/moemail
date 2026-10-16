import assert from "node:assert/strict";
import test from "node:test";
import { decryptWithSecret, encryptWithSecret, StoredIcloudCredentialError } from "./credential-cipher";

const secret = "original-deployment-secret-32-characters";

test("existing v1 credentials remain readable across version updates", () => {
  const saved = encryptWithSecret("xxxx-xxxx-xxxx-xxxx", secret);
  assert.match(saved, /^v1:/);
  assert.equal(decryptWithSecret(saved, secret), "xxxx-xxxx-xxxx-xxxx");
});

test("a changed key is a stored credential error", () => {
  const saved = encryptWithSecret("unchanged-app-password", secret);
  assert.throws(() => decryptWithSecret(saved, "another-deployment-secret-32-characters"), StoredIcloudCredentialError);
});

test("missing or short deployment secrets are configuration errors", () => {
  const saved = encryptWithSecret("unchanged-app-password", secret);
  for (const invalid of [undefined, "short"]) {
    assert.throws(() => decryptWithSecret(saved, invalid), (error) => error instanceof Error && !(error instanceof StoredIcloudCredentialError) && /EXTERNAL_MAIL_SECRET/.test(error.message));
  }
});

test("corrupt credentials fail without exposing the saved password", () => {
  assert.throws(() => decryptWithSecret("v1:invalid:invalid:invalid", secret), StoredIcloudCredentialError);
});
