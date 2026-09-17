import { getEnv } from "@/lib/env";

export function database() {
  return getEnv().DB;
}

export async function all<T>(query: string, ...params: unknown[]): Promise<T[]> {
  const result = await database().prepare(query).bind(...params).all<T>();
  return result.results || [];
}

export async function one<T>(query: string, ...params: unknown[]): Promise<T | null> {
  return (await database().prepare(query).bind(...params).first<T>()) || null;
}

export async function run(query: string, ...params: unknown[]) {
  return database().prepare(query).bind(...params).run();
}

export async function batch(statements: Array<{ query: string; params?: unknown[] }>) {
  if (statements.length === 0) return [];
  return database().batch(statements.map(({ query, params = [] }) => database().prepare(query).bind(...params)));
}
