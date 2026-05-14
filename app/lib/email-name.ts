import { customAlphabet } from "nanoid"

export const EMAIL_NAME_LENGTH = 8
export const EMAIL_NAME_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"
export const EMAIL_NAME_PATTERN = /^[A-Za-z0-9_-]+$/

export const generateEmailName = customAlphabet(EMAIL_NAME_ALPHABET, EMAIL_NAME_LENGTH)
export const getEmailNamePrefix = (value: string) => value.split("@")[0]
export const isValidEmailNamePrefix = (value: string) => EMAIL_NAME_PATTERN.test(value)
