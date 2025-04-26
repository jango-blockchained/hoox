declare module "bun:test" {
  export const expect: typeof import("@jest/expect").expect;
  export const jest: typeof import("jest-mock").jest;
  export const test: (...args: any[]) => any;
  export const describe: (...args: any[]) => any;
  export const beforeEach: (...args: any[]) => any;
  export const afterEach: (...args: any[]) => any;
}

declare global {
  class WorkerEnv {
    constructor(env?: Record<string, unknown>);
  }

  class ExecutionContext {
    waitUntil(promise: Promise<any>): void;
    passThroughOnException(): void;
  }
}

export {};
