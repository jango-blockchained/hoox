import { expect, jest, test, describe, beforeEach, afterEach } from "bun:test";

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
