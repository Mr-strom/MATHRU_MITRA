/**
 * MaatruMitra — Login page.
 *
 * Minimal, on-brand login screen for the development workspace.
 * Uses the existing Orbiting Care Map design tokens.
 * Clearly labelled as a development prototype.
 *
 * Design: dark ink ground, marigold CTA, DM Serif Display heading.
 * No patient data on this page.
 */

import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useLocation } from "wouter";
import { ShieldCheck, LogIn, AlertCircle } from "lucide-react";
import { ApiRequestError } from "../lib/api";

const logoImage = "/manus-storage/maatrumitra-care-orbit-logo_1689796a.png";

export default function Login() {
  const { user, login } = useAuth();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Redirect if already authenticated
  if (user) {
    navigate("/workspace");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate("/workspace");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.body.error ?? "Login failed. Please check your credentials.");
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-grain" aria-hidden="true" />

      <div className="login-card">
        <a className="brand login-brand" href="/">
          <img className="brand-mark" src={logoImage} alt="" />
          <span className="brand-name">Maatru<span>Mitra</span></span>
        </a>

        <div className="login-prototype-notice" role="note">
          <ShieldCheck size={14} />
          <span>Development prototype login · No live patient data</span>
        </div>

        <h1 className="login-heading">Sign in to<br />the workspace</h1>
        <p className="login-sub">
          Use the seeded demo credentials from <code>pnpm db:seed</code> output.
        </p>

        <form className="login-form" onSubmit={handleSubmit} aria-label="Sign in form">
          <div className="login-field">
            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. asha.demo"
              required
              aria-required="true"
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Demo password"
              required
              aria-required="true"
            />
          </div>

          {error && (
            <div className="login-error" role="alert" aria-live="assertive">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <button
            id="login-submit"
            type="submit"
            className="button-primary login-submit"
            disabled={loading}
            aria-busy={loading}
          >
            <LogIn size={16} />
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <a href="/" className="login-back">← Return to landing page</a>
      </div>
    </main>
  );
}
