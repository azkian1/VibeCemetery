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
      const { error } = await supabaseAdmin
        .from('users')
        .upsert({
          github_id: githubProfile.id,
          github_username: githubProfile.login,
          avatar_url: githubProfile.avatar_url,
        }, { onConflict: 'github_id' })

      if (error) {
        console.error('NextAuth user upsert failed', error)
        return false
      }

      return true
    },
    async session({ session, token }) {
      session.user.github_username = token.github_username as string
      if (session.user.github_username) {
        const { data, error } = await supabaseAdmin
          .from('users')
          .select('x_first_grave_shared_at')
          .eq('github_username', session.user.github_username)
          .maybeSingle()

        if (error) {
          console.error('NextAuth user progression load failed', error)
        } else {
          session.user.x_first_grave_shared_at = data?.x_first_grave_shared_at ?? null
        }
      }
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
