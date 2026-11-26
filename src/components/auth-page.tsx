import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

export function AuthPage() {
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    document.title = "Log in - FunkinArchive"
    return () => { document.title = "Browse - FunkinArchive" }
  }, [])

  async function handleGitHubSignIn() {
    setError("")
    setPending(true)
    try {
      const result = await authClient.signIn.social({
        provider: "github",
        callbackURL: "/",
      })
      if (result.error) throw new Error(result.error.message)
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Could not sign in with GitHub. Please try again.")
      setPending(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <header className="auth-heading">
          <h1 id="auth-title">Sign in to FunkinArchive</h1>
        </header>
        <Button type="button" variant="outline" className="auth-github-button" disabled={pending} onClick={() => { void handleGitHubSignIn() }}>
          {pending ? "Connecting..." : "Continue with GitHub"}
        </Button>
        {error && <p className="auth-feedback" role="alert">{error}</p>}
        <Link className="auth-back" to="/">Back to Browse</Link>
      </section>
    </main>
  )
}
