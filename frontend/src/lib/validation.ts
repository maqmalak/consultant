import { z } from "zod";

/** Same rules as the server (utils/validators.py); the server re-checks everything. */
export const MOBILE_RE = /^(?:\+92|0092|92|0)?3\d{9}$/;
export const CNIC_RE = /^\d{5}-?\d{7}-?\d$/;

export const CLIENT_TYPES = ["Individual-Salaried", "Individual-Business", "AOP", "Company", "Other"] as const;

export const signupSchema = z.object({
  full_name: z.string().trim().min(3, "Enter your full name"),
  mobile: z.string().trim().transform((v) => v.replace(/[\s-]/g, "")).refine((v) => MOBILE_RE.test(v), "Enter a Pakistani mobile number, e.g. 0300 1234567"),
  email: z.string().trim().email("Enter a valid email"),
  cnic: z.string().trim().optional().refine((v) => !v || CNIC_RE.test(v), "CNIC format is 12345-1234567-1"),
  city: z.string().trim().optional(),
  client_type: z.enum(CLIENT_TYPES),
  consent: z.literal(true, { errorMap: () => ({ message: "Please accept to continue" }) }),
  whatsapp_opt_in: z.boolean().optional(),
});
export type SignupDetails = z.infer<typeof signupSchema>;

export const passwordSchema = z.object({
  password: z.string().min(8, "Use at least 8 characters").regex(/[A-Za-z]/, "Add a letter").regex(/\d/, "Add a number"),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: "Passwords do not match", path: ["confirm"] });
