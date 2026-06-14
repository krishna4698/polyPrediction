import {z, ZodLazy} from "zod"

const userSchema = z.object({
      email: z.string(),
      username: z.string(),
      password: z.string(),
      
})