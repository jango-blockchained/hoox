import { expect, jest, test, describe, beforeEach, afterEach } from "bun:test";

// Make test utilities globally available
Object.assign(global, {
  expect,
  jest,
  test,
  describe,
  beforeEach,
  afterEach,
});

// Mock Cloudflare Workers environment
class WorkerEnv {
  constructor(env = {}) {
    Object.assign(this, env);
  }
}

class ExecutionContext {
  waitUntil() {}
  passThroughOnException() {}
}

global.Response = Response;
global.Request = Request;
global.Headers = Headers;
global.ExecutionContext = ExecutionContext;
global.WorkerEnv = WorkerEnv;
