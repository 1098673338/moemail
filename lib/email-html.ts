import sanitizeHtml from "sanitize-html";

const emailAllowedAttributes = {
  ...sanitizeHtml.defaults.allowedAttributes,
  "*": [
    "align",
    "background",
    "bgcolor",
    "border",
    "cellpadding",
    "cellspacing",
    "class",
    "color",
    "dir",
    "height",
    "id",
    "lang",
    "role",
    "style",
    "valign",
    "width",
  ],
  meta: ["charset", "content", "http-equiv", "name"],
  font: ["face", "size"],
  img: ["src", "srcset", "alt", "title", "width", "height", "loading"],
};

export function sanitizeEmailHtml(value?: string | null) {
  if (!value) return null;
  return sanitizeHtml(value, {
    // Transactional-email templates commonly put layout CSS in <head> and rely
    // on old table-email tags such as <center> and <font>. The result remains
    // isolated in a sandboxed iframe, while scripts and event handlers stay
    // disallowed by sanitize-html.
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "style",
      "html",
      "head",
      "body",
      "meta",
      "title",
      "center",
      "font",
    ]),
    allowVulnerableTags: true,
    allowedAttributes: emailAllowedAttributes,
    parseStyleAttributes: false,
    allowedSchemes: ["http", "https", "mailto", "cid"],
    allowedSchemesAppliedToAttributes: ["background", "cite", "href", "src"],
    allowProtocolRelative: false,
  });
}
