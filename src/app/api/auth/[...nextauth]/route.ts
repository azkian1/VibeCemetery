import NextAuth, { NextAuthOptions } from 'next-auth'
import GithubProvider from 'next-auth/providers/github'
import { supabaseAdmin } from '@/lib/supabase'

interface GitHubProfile {
  id: number;
  login: string;
  avatar_url: string;
}

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
  throw new Error('Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET');
}

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: GITHUB_CLIENT_ID,
      clientSecret: GITHUB_CLIENT_SECRET,
      authorization: { params: { scope: 'read:user' } },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const githubProfile = profile as GitHubProfile
      await supabaseAdmin
        .from('users')
        .upsert({
          github_id: githubProfile.id,
          github_username: githubProfile.login,
          avatar_url: githubProfile.avatar_url,
        }, { onConflict: 'github_id' })
      return true
    },
    async session({ session, token }) {
      session.user.github_username = token.github_username as string
      return session
    },
    async jwt({ token, profile }) {
      if (profile) {
        token.github_username = (profile as GitHubProfile).login
      }
      return token
    },
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
