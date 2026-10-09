import NextAuth from "next-auth";

// This release exposes the public catalog only. Session checks remain in place
// for protected routes, but no sign-in method is available in this build.
export const { handlers, auth, signOut } = NextAuth({
  providers: [],
  secret: process.env.AUTH_SECRET,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
});
