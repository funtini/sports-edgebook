import type { SupabaseClient } from '@supabase/supabase-js'

/** One `from(table)` chain: the table and every builder method called on it, in order. */
export interface Query {
  table: string
  ops: [method: string, args: unknown[]][]
}

type Response = { data?: unknown; error?: unknown }

/** Answers a query; a promise holds the answer back until it resolves. */
export type Responder = (query: Query) => Response | Promise<Response>

/** Minimal stand-in for the Supabase client: records each query and answers it with `respond`. */
export function fakeSupabase(respond: Responder) {
  const queries: Query[] = []
  const client = {
    from(table: string) {
      const query: Query = { table, ops: [] }
      queries.push(query)
      const builder: unknown = new Proxy(
        {},
        {
          get(_target, method: string) {
            if (method === 'then') {
              return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                Promise.resolve(respond(query))
                  .then((response) => ({ data: null, error: null, ...response }))
                  .then(resolve, reject)
            }
            return (...args: unknown[]) => {
              query.ops.push([method, args])
              return builder
            }
          },
        },
      )
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, queries }
}

export function has(query: Query, method: string): boolean {
  return query.ops.some(([m]) => m === method)
}

export function argsOf(query: Query, method: string): unknown[] | undefined {
  return query.ops.find(([m]) => m === method)?.[1]
}
