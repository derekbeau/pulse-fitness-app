import { describe, expect, it } from "vitest";

import { type User, userSchema } from "./index";

describe("userSchema", () => {
  it("parses a valid user object", () => {
    const user = userSchema.parse({
      id: "user-1",
      name: "Derek",
    });

    expect(user).toEqual({
      id: "user-1",
      name: "Derek",
    });
  });

  it("rejects payloads missing required fields", () => {
    expect(() => userSchema.parse({ id: "user-1" })).toThrow();
  });

  it("infers the User type from the schema", () => {
    const user: User = {
      id: "user-2",
      name: "Pulse",
    };

    expect(user.name).toBe("Pulse");
  });
});
