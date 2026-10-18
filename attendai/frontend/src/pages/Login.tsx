import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Dial } from "../components/Dial";
import { Logo } from "../components/Logo";
import { Button, Field, Input } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const DEMO = [
  { label: "Admin", email: "admin@attendai.com" },
  { label: "HR", email: "hr@attendai.com" },
  { label: "Manager", email: "manager@attendai.com" },
  { label: "Employee", email: "neha@attendai.com" },
];
const DEMO_PASSWORD = "Demo@1234";
const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO !== "false";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="flex flex-col justify-between gap-10 bg-hero p-8 text-hero-ink sm:p-12">
        <Logo />
        <div className="grid items-center gap-8 xl:grid-cols-[1fr_auto]">
          <div>
            <h1 className="max-w-md font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
              Know who's in without chasing anyone.
            </h1>
            <p className="mt-4 max-w-sm text-hero-muted">
              Check-ins, shifts and leave for your whole team, in one place that works as well on a phone as on a desk.
            </p>
          </div>
          <div className="hidden xl:block" aria-hidden><Dial minutes={342} state="working" size={240} /></div>
        </div>
        <p className="hidden text-sm text-hero-muted lg:block">Made for IT teams with office, hybrid and remote days.</p>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight">Sign in</h2>
            <p className="mt-1 text-muted">Use your work email and password.</p>
          </div>
          <Field label="Work email">
            <Input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <div className="relative">
              <Input type={show ? "text" : "password"} required autoComplete="current-password" className="pr-11"
                value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)}
                className="absolute right-1 top-1 rounded-md p-2 text-muted hover:text-ink">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>
          {error && <p role="alert" className="rounded-lg border border-absent/40 bg-absent/10 px-3 py-2 text-sm">{error}</p>}
          <Button type="submit" variant="primary" loading={busy} className="h-11 w-full">Sign in</Button>

          {SHOW_DEMO && (
            <div className="border-t border-line pt-5">
              <p className="mb-3 text-sm font-medium">Try a demo account</p>
              <div className="flex flex-wrap gap-2">
                {DEMO.map((d) => (
                  <button key={d.label} type="button" onClick={() => { setEmail(d.email); setPassword(DEMO_PASSWORD); }}
                    className="h-8 rounded-full border border-line px-3.5 text-sm font-medium hover:bg-sunken">
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Every demo account uses the password {DEMO_PASSWORD}.</p>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
