import { z } from "zod"

export const userSchema = z.object({
      email: z.string(),
      username: z.string(),
      password: z.string(),
      
})

export const loginSchema = z.object({
      email: z.string(),
      password: z.string(),
})

export type createUserType= z.infer<typeof userSchema>
export type loginUserType = z.infer<typeof loginSchema>
