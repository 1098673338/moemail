import { customAlphabet } from "nanoid"

export const EMAIL_NAME_LENGTH = 8
export const EMAIL_NAME_START_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
export const EMAIL_NAME_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"
export const EMAIL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
export const EMAIL_NAME_START_PATTERN = /^[A-Za-z0-9]/

const generateEmailNameStart = customAlphabet(EMAIL_NAME_START_ALPHABET, 1)
const generateEmailNameRest = customAlphabet(EMAIL_NAME_ALPHABET, EMAIL_NAME_LENGTH - 1)

export const generateEmailName = () => `${generateEmailNameStart()}${generateEmailNameRest()}`
export const getEmailNamePrefix = (value: string) => value.split("@")[0]
export const isValidEmailNamePrefix = (value: string) => EMAIL_NAME_PATTERN.test(value)
export const startsWithValidEmailNameChar = (value: string) => EMAIL_NAME_START_PATTERN.test(value)
