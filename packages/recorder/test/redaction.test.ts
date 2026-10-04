import { describe, expect, it } from "vitest";
import { redactBody, redactHeaders } from "../src/index.js";

describe("redaction", () => {
  it("redacts headers case-insensitively", () => {
    expect(redactHeaders({ Authorization: "Bearer secret", Accept: "json" })).toEqual({
      Authorization: "[REDACTED]",
      Accept: "json",
    });
  });

  it("redacts sensitive fields recursively", () => {
    expect(
      redactBody({ user: { password: "secret", name: "Darko" }, access_token: "abc" }),
    ).toEqual({
      user: { password: "[REDACTED]", name: "Darko" },
      access_token: "[REDACTED]",
    });
  });
});
