const LINK_REGEX = /(?:https?:\/\/|www\.)[^\s<>"']+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const TRAILING_PUNCTUATION = ".,!?;:]}"
const SKIP_LINKIFY_SELECTOR = "a,script,style,textarea,code,pre"

function trimTrailingPunctuation(value: string) {
  let linkText = value
  let trailing = ""

  while (linkText.length > 0) {
    const lastChar = linkText[linkText.length - 1]
    const shouldTrimClosingParen = lastChar === ")"
      && (linkText.match(/\(/g)?.length ?? 0) < (linkText.match(/\)/g)?.length ?? 0)

    if (!TRAILING_PUNCTUATION.includes(lastChar) && !shouldTrimClosingParen) {
      break
    }

    trailing = lastChar + trailing
    linkText = linkText.slice(0, -1)
  }

  return { linkText, trailing }
}

function getHref(value: string) {
  if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) {
    return `mailto:${value}`
  }

  const href = value.toLowerCase().startsWith("www.")
    ? `https://${value}`
    : value

  try {
    const url = new URL(href)
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null
  } catch {
    return null
  }
}

export function addLazyLoadingToImages(html: string) {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    let nextTag = tag

    if (!/\sloading\s*=/i.test(nextTag)) {
      nextTag = nextTag.replace(/^<img/i, '<img loading="lazy"')
    }

    if (!/\sdecoding\s*=/i.test(nextTag)) {
      nextTag = nextTag.replace(/^<img/i, '<img decoding="async"')
    }

    if (!/\sreferrerpolicy\s*=/i.test(nextTag)) {
      nextTag = nextTag.replace(/^<img/i, '<img referrerpolicy="no-referrer"')
    }

    return nextTag
  })
}

export function enhancePlainLinksInHtml(html: string, ownerDocument: Document = document) {
  const template = ownerDocument.createElement("template")
  template.innerHTML = html
  const walker = ownerDocument.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let currentNode = walker.nextNode()

  while (currentNode) {
    const parentElement = currentNode.parentElement

    if (parentElement && !parentElement.closest(SKIP_LINKIFY_SELECTOR)) {
      textNodes.push(currentNode as Text)
    }

    currentNode = walker.nextNode()
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue || ""
    LINK_REGEX.lastIndex = 0
    if (!LINK_REGEX.test(text)) continue

    LINK_REGEX.lastIndex = 0
    const fragment = ownerDocument.createDocumentFragment()
    let lastIndex = 0

    for (const match of text.matchAll(LINK_REGEX)) {
      const matchedText = match[0]
      const matchIndex = match.index ?? 0

      if (matchIndex > lastIndex) {
        fragment.append(ownerDocument.createTextNode(text.slice(lastIndex, matchIndex)))
      }

      const { linkText, trailing } = trimTrailingPunctuation(matchedText)
      const href = getHref(linkText)

      if (href) {
        const anchor = ownerDocument.createElement("a")
        anchor.href = href
        anchor.target = "_blank"
        anchor.rel = "noopener noreferrer"
        anchor.textContent = linkText
        fragment.append(anchor)
      } else {
        fragment.append(ownerDocument.createTextNode(matchedText))
      }

      if (trailing) {
        fragment.append(ownerDocument.createTextNode(trailing))
      }

      lastIndex = matchIndex + matchedText.length
    }

    if (lastIndex < text.length) {
      fragment.append(ownerDocument.createTextNode(text.slice(lastIndex)))
    }

    textNode.replaceWith(fragment)
  }

  return template.innerHTML
}

export function buildHtmlDocument(html: string) {
  const enhancedHtml = typeof document === "undefined"
    ? html
    : enhancePlainLinksInHtml(html)

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_blank">
        <style>
          html, body {
            margin: 0;
            padding: 0;
            min-height: 100%;
            font-family: system-ui, -apple-system, sans-serif;
            color: #000;
            background: #fff;
          }
          body {
            padding: 20px;
          }
          img {
            max-width: 100%;
            height: auto;
          }
          a {
            color: #2563eb;
            text-decoration: underline;
          }
          * {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
          *::-webkit-scrollbar {
            display: none;
            width: 0;
            height: 0;
          }
        </style>
      </head>
      <body>${addLazyLoadingToImages(enhancedHtml)}</body>
    </html>
  `
}
