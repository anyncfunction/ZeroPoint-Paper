export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

let implementation: FetchImplementation = (input, init) =>
  globalThis.fetch(input, init)

export function setFetchImplementation(next: FetchImplementation): void {
  implementation = next
}

export function fetchWithSystemStack(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  return implementation(input, init)
}

