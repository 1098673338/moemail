"use client"

import { Fragment, type ReactNode } from "react"

interface LinkifiedTextProps {
  text: string
}

const LINK_REGEX = /(?:https?:\/\/|www\.)[^\s<>"']+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const TRAILING_PUNCTUATION = ".,!?;:]}"

function trimTrailingPunctuation(value: string) {
  let url = value
  let trailing = ""

  while (url.length > 0) {
    const lastChar = url[url.length - 1]
    const shouldTrimClosingParen = lastChar === ")"
      && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)

    if (!TRAILING_PUNCTUATION.includes(lastChar) && !shouldTrimClosingParen) {
      break
    }

    trailing = lastChar + trailing
    url = url.slice(0, -1)
  }

  return { url, trailing }
}

function getSafeHref(value: string) {
  if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) {
    return `mailto:${value}`
  }

  const href = value.toLowerCase().startsWith("www.")
    ? `https://${value}`
    : value

  try {
    const url = new URL(href)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null
  } catch {
    return null
  }
}

export function LinkifiedText({ text }: LinkifiedTextProps) {
  const nodes: ReactNode[] = []
  let lastIndex = 0

  for (const match of text.matchAll(LINK_REGEX)) {
    const matchedText = match[0]
    const matchIndex = match.index ?? 0

    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex))
    }

    const { url, trailing } = trimTrailingPunctuation(matchedText)
    const href = getSafeHref(url)

    if (href) {
      nodes.push(
        <a
          key={`${matchIndex}-${url}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-primary underline underline-offset-2"
        >
          {url}
        </a>
      )
    } else {
      nodes.push(matchedText)
    }

    if (trailing) {
      nodes.push(trailing)
    }

    lastIndex = matchIndex + matchedText.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return (
    <>
      {nodes.map((node, index) => (
        <Fragment key={typeof node === "string" ? `${index}-${node}` : index}>
          {node}
        </Fragment>
      ))}
    </>
  )
}
