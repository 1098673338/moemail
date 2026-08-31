export const D1_MAX_BOUND_PARAMETERS = 100

export function chunkForD1BoundParameters<T>(
  values: readonly T[],
  boundParametersPerValue = 1
) {
  if (!Number.isInteger(boundParametersPerValue) || boundParametersPerValue <= 0) {
    throw new Error("boundParametersPerValue must be a positive integer")
  }

  const chunkSize = Math.max(
    1,
    Math.floor(D1_MAX_BOUND_PARAMETERS / boundParametersPerValue)
  )
  const chunks: T[][] = []

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize))
  }

  return chunks
}
