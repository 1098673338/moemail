import assert from "node:assert/strict";
import test from "node:test";
import { verificationCode } from "./verification-code";

type Sample = {
  name: string;
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  verificationCodeIgnored?: boolean;
  expected: string | null;
};

const samples: Sample[] = [
  { name: "Chinese code without spaces", textBody: "您的验证码为123456，请勿透露。", expected: "123456" },
  { name: "English verification code", textBody: "Your verification code is 654321. It expires in 5 minutes.", expected: "654321" },
  { name: "leading zeros", textBody: "Security code: 001234", expected: "001234" },
  { name: "code in subject", subject: "123456 is your login code", expected: "123456" },
  { name: "spaced code", textBody: "验证码：123 456", expected: "123456" },
  { name: "hyphenated code", textBody: "Your one-time password: 123-456", expected: "123456" },
  { name: "six digit cells", textBody: "验证码：1 2 3 4 5 6", expected: "123456" },
  { name: "full width digits and invisible separators", textBody: "验证码：１２３\u200b４５６", expected: "123456" },
  { name: "separate plain text paragraph", textBody: "Your verification code is:\n\n123456\n\nValid for 5 minutes", expected: "123456" },
  { name: "verification subject with code only", subject: "Verify your email", textBody: "123456", expected: "123456" },
  { name: "generic code with authentication subject", subject: "Sign in to Example", textBody: "Your code is 123456", expected: "123456" },
  { name: "generic code with authentication sentence", textBody: "To verify your email, enter this code: 123456", expected: "123456" },
  { name: "no authentication context", textBody: "Your parcel number is 123456", expected: null },
  { name: "bare number", textBody: "123456", expected: null },
  { name: "postal code", textBody: "Postal code: 100000", expected: null },
  { name: "zip code", textBody: "ZIP code: 100000", expected: null },
  { name: "hyphenated postal label with authentication subject", subject: "Verify email", textBody: "Postal-code: 100000", expected: null },
  { name: "Chinese postal code", textBody: "邮政编码：100000", expected: null },
  { name: "postal code with authentication subject", subject: "Verify your email", textBody: "Postal code: 100000", expected: null },
  { name: "postal code below label", subject: "Verify your email", textBody: "Postal code\n100000", expected: null },
  { name: "postal code in multiline address", subject: "Verify your email", textBody: "Address: 12 Example Road\nShanghai\n100000", expected: null },
  { name: "order number", subject: "Email verification", textBody: "Order code: 987654", expected: null },
  { name: "invoice number", textBody: "Verification code delivery failed. Invoice: 123456", expected: null },
  { name: "phone number", subject: "Your verification code", textBody: "Phone: 123456", expected: null },
  { name: "coupon code", subject: "Verify your email", textBody: "Discount code: 123456", expected: null },
  { name: "expiry duration", textBody: "Your verification code is valid for 123456 seconds", expected: null },
  { name: "Chinese expiry duration", textBody: "验证码有效期为123456秒", expected: null },
  { name: "formatted phone number fragment", textBody: "Verification code help: 123456-7890", expected: null },
  { name: "long number", textBody: "Verification code: 123456789", expected: null },
  { name: "alphanumeric identifier", textBody: "Verification code: AB123456CD", expected: null },
  { name: "unsupported four digit code", textBody: "Verification code: 1234", expected: null },
  { name: "postal code and actual code in same sentence", textBody: "Postal code: 100000, verification code: 654321", expected: "654321" },
  { name: "actual code before postal code", textBody: "Your verification code is 123456; postal code is 100000", expected: "123456" },
  { name: "Chinese code before order number", textBody: "验证码：123456，订单号：987654", expected: "123456" },
  { name: "Chinese postal code before actual code", textBody: "邮编：100000，验证码：654321", expected: "654321" },
  { name: "two plausible codes", textBody: "Login code: 123456\nSecurity code: 654321", expected: null },
  { name: "two unlabelled codes under authentication subject", subject: "Verify your email", textBody: "123456\n654321", expected: null },
  { name: "same code repeated", subject: "Verification code: 123456", textBody: "Your verification code is 123456", expected: "123456" },
  { name: "expired code excluded", textBody: "Expired verification code: 111111\nYour verification code: 222222", expected: "222222" },
  { name: "explicitly dismissed code", textBody: "验证码：123456", verificationCodeIgnored: true, expected: null },
  { name: "empty message", expected: null },
  { name: "HTML paragraphs", htmlBody: "<h1>Your verification code</h1><p><strong>123456</strong></p>", expected: "123456" },
  { name: "HTML inline markup", htmlBody: "<p>Your <b>verification code</b> is <strong>123456</strong></p>", expected: "123456" },
  { name: "HTML digit cells", htmlBody: "<p>Verification code</p><div><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span></div>", expected: "123456" },
  { name: "HTML entities", htmlBody: "<p>Verification&nbsp;code: &#49;&#50;&#51;&#52;&#53;&#54;</p>", expected: "123456" },
  { name: "HTML table cells", htmlBody: "<table><tr><td>Verification code</td></tr><tr><td>123456</td></tr></table>", expected: "123456" },
  { name: "footer number excluded", subject: "Your verification code", htmlBody: "<p>Follow the verification link.</p><footer>100000</footer>", expected: null },
  { name: "address number excluded", subject: "Verify email", htmlBody: "<address>100000</address>", expected: null },
  { name: "footer class excluded", subject: "Verify email", htmlBody: '<div class="email-footer">100000</div>', expected: null },
  { name: "signature id excluded", subject: "Verify email", htmlBody: '<div id="signature">100000</div>', expected: null },
  { name: "real code with footer", htmlBody: "<p>Your verification code is</p><p>123456</p><footer>Postal code: 100000</footer>", expected: "123456" },
  { name: "hidden preheader excluded", htmlBody: '<div style="display: none">Verification code: 111111</div><p>Verification code: 222222</p>', expected: "222222" },
  { name: "hidden attribute excluded", htmlBody: "<div hidden>Verification code: 111111</div><p>Verification code: 222222</p>", expected: "222222" },
  { name: "aria hidden excluded", htmlBody: '<div aria-hidden="true">Verification code: 111111</div><p>Verification code: 222222</p>', expected: "222222" },
  { name: "style script and head excluded", htmlBody: "<head><title>Verification code 111111</title></head><style>.code {color:#123456}</style><script>const otp = 111111;</script><p>Verification code: 222222</p>", expected: "222222" },
  { name: "HTML quoted old code excluded", htmlBody: "<p>Verification code: 222222</p><blockquote><p>Verification code: 111111</p></blockquote>", expected: "222222" },
  { name: "HTML comment excluded", htmlBody: "<!-- Verification code 111111 --><p>Verification code: 222222</p>", expected: "222222" },
  { name: "link query digits excluded", subject: "Verify your email", htmlBody: '<a href="https://example.com/verify?code=123456">Verify email</a><p>Postal code: 100000</p>', expected: null },
  { name: "HTML takes precedence over plain text", textBody: "Verification code: 111111", htmlBody: "<p>Verification code: 222222</p>", expected: "222222" },
  { name: "excluded HTML never falls back to unsafe plain text", subject: "Verify email", htmlBody: "<footer>100000</footer>", textBody: "100000", expected: null },
  { name: "plain quoted old code excluded", textBody: "Verification code: 222222\n> Verification code: 111111", expected: "222222" },
  { name: "forwarded old code excluded", textBody: "Verification code: 222222\n-----Original Message-----\nVerification code: 111111", expected: "222222" },
];

for (const { name, expected, ...message } of samples) {
  test(name, () => {
    const result = verificationCode({ subject: "", textBody: "", htmlBody: null, verificationCodeIgnored: false, ...message });
    assert.equal(result?.value ?? null, expected);
    if (result) assert.equal(result.display.replace(/[ -]/g, ""), result.value);
  });
}

test("recognition stays deterministic across repeated calls", () => {
  const message = { subject: "Verify email", textBody: "Your code is 012345", htmlBody: null, verificationCodeIgnored: false };
  assert.deepEqual(verificationCode(message), verificationCode(message));
  assert.deepEqual(verificationCode(message), { display: "012345", value: "012345" });
});
