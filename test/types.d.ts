declare module "bun:test" {
  export const expect: typeof import("@jest/expect").expect;
  export const jest: typeof import("jest-mock").jest;
  export const test: Function;
  export const describe: Function;
  export const beforeEach: Function;
  export const afterEach: Function;
}

declare global {
  var expect: typeof import("@jest/expect").expect;
  var jest: typeof import("jest-mock").jest;
  var test: Function;
  var describe: Function;
  var beforeEach: Function;
  var afterEach: Function;

  class WorkerEnv {
    constructor(env?: Record<string, any>);
  }

  class ExecutionContext {
    waitUntil(): void;
    passThroughOnException(): void;
  }
}
