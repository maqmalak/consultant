import { describe, expect, it } from "vitest";
import { passwordSchema, signupSchema } from "@/lib/validation";

const ok = { full_name: "Ali Raza", mobile: "0300 1234567", email: "ali@example.com", client_type: "Individual-Salaried", consent: true } as const;

describe("signup validation (mirrors the server rules)", () => {
  it("accepts a valid Pakistani signup", () => {
    expect(signupSchema.safeParse(ok).success).toBe(true);
    expect(signupSchema.safeParse({ ...ok, mobile: "+923001234567", cnic: "12345-1234567-1" }).success).toBe(true);
  });
  it("rejects bad mobile, CNIC, email and missing consent", () => {
    expect(signupSchema.safeParse({ ...ok, mobile: "0421234567" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...ok, cnic: "123-45" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...ok, email: "nope" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...ok, consent: false }).success).toBe(false);
  });
  it("needs matching, reasonably strong passwords", () => {
    expect(passwordSchema.safeParse({ password: "abcdefgh", confirm: "abcdefgh" }).success).toBe(false);
    expect(passwordSchema.safeParse({ password: "abcd1234", confirm: "abcd1235" }).success).toBe(false);
    expect(passwordSchema.safeParse({ password: "abcd1234", confirm: "abcd1234" }).success).toBe(true);
  });
});
