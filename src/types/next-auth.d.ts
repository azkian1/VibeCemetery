import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      github_username?: string
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    github_username?: string
  }
}
