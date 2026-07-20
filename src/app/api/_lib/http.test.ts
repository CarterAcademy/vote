import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { assertSameOrigin } from "./http";

describe("assertSameOrigin", () => {
  it("accepts the browser host when Next runs behind a tunnel", () => {
    const request = new NextRequest("http://127.0.0.1:3100/api/test", {
      method: "POST",
      headers: {
        host: "10.100.80.126:3011",
        origin: "http://10.100.80.126:3011",
        "sec-fetch-site": "same-origin",
      },
    });

    expect(() => assertSameOrigin(request)).not.toThrow();
  });

  it("rejects a different origin host", () => {
    const request = new NextRequest("http://127.0.0.1:3100/api/test", {
      method: "POST",
      headers: {
        host: "10.100.80.126:3011",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
    });

    expect(() => assertSameOrigin(request)).toThrow("跨站请求已被拒绝");
  });
});
