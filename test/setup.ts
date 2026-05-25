import {
  expect,
  jest,
  test,
  describe,
  beforeEach,
  afterEach,
  mock,
} from "bun:test";

Object.assign(global, {
  expect,
  jest,
  test,
  describe,
  beforeEach,
  afterEach,
});

global.Response = Response;
global.Request = Request;
global.Headers = Headers;

// Mock cloudflare:workers built-in module (not available in bun test)
mock.module("cloudflare:workers", () => ({
  DurableObject: class MockDurableObject {
    ctx: any;
    state: any;
    constructor(ctx: any, state: any) {
      this.ctx = ctx;
      this.state = state;
    }
  },
}));
