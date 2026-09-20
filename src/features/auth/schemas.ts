import { z } from "zod";

export const loginSchema = z.object({
  phone: z.string().trim().min(1, "Phone is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;
