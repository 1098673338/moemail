import assert from "node:assert/strict"
import test from "node:test"
import {
  D1_MAX_BOUND_PARAMETERS,
  chunkForD1BoundParameters,
} from "./d1-batch"

test("keeps one-parameter queries within the D1 limit", () => {
  const values = Array.from({ length: 205 }, (_, index) => index)
  const chunks = chunkForD1BoundParameters(values)

  assert.deepEqual(chunks.map(chunk => chunk.length), [100, 100, 5])
  assert.ok(chunks.every(chunk => chunk.length <= D1_MAX_BOUND_PARAMETERS))
  assert.deepEqual(chunks.flat(), values)
})

test("accounts for multiple bound parameters per inserted row", () => {
  const values = Array.from({ length: 51 }, (_, index) => index)
  const chunks = chunkForD1BoundParameters(values, 4)

  assert.deepEqual(chunks.map(chunk => chunk.length), [25, 25, 1])
  assert.ok(chunks.every(chunk => chunk.length * 4 <= D1_MAX_BOUND_PARAMETERS))
})

test("returns no queries for an empty input", () => {
  assert.deepEqual(chunkForD1BoundParameters([]), [])
})
