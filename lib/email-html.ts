import sanitizeHtml from "sanitize-html";

const emailAllowedAttributes = {
  ...sanitizeHtml.defaults.allowedAttributes,
  "*": [
    "align",
    "bgcolor",
    "border",
    "cellpadding",
    "cellspacing",
    "class",
    "color",
    "height",
    "id",
    "role",
    "style",
    "valign",
    "width",
  ],
  img: ["src", "srcset", "alt", "title", "width", "height", "loading"],
};

export function sanitizeEmailHtml(value?: string | null) {
  if (!value) return null;
  return sanitizeHtml(value, {
    // Email layouts commonly depend on <style> and inline CSS. The result is
    // rendered inside a sandboxed iframe in the client, so it cannot affect the app shell.
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "style"]),
    allowVulnerableTags: true,
    allowedAttributes: emailAllowedAttributes,
    parseStyleAttributes: false,
    allowedSchemes: ["http", "https", "mailto", "cid"],
    allowProtocolRelative: false,
  });
}
