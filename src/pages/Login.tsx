import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context";
import { t } from "../i18n";
import { get, ApiError } from "../lib/api";
import { Btn, PixelMark, inputCls } from "../components/ui";

const REMEMBER_KEY = "motamayez_remember";
const USER_KEY = "motamayez_login_user";

function loginErrKey(error: unknown) {
  const err = error as ApiError;
  const code = String(err?.message || "");
  const status = Number(err?.status || 0);
  if (code === "invalid_credentials" || code === "missing_credentials" || code === "unauthorized") return "loginBadCreds" as const;
  if (code === "api_unavailable" || status === 404 || status === 405 || status === 502 || status === 503) return "loginApiDown" as const;
  if (code === "unreachable" || status === 0) return "loginUnreachable" as const;
  return "loginServerError" as const;
}

export default function Login() {
  const { login, tr, lang, setLang, theme, setTheme } = useApp();
  const nav = useNavigate();
  const saved = localStorage.getItem(REMEMBER_KEY) === "1";
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    get<{ ok?: boolean }>("/api/health")
      .then((data) => {
        if (live && !data?.ok) setErr(t(lang, "loginApiDown"));
      })
      .catch((error) => {
        if (!live || (error as Error).message === "aborted") return;
        setErr(t(lang, loginErrKey(error)));
      });
    return () => {
      live = false;
    };
  }, [lang]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07111f] p-6">
      <div className="pointer-events-none absolute -top-24 start-1/4 h-72 w-72 rounded-full bg-[#c9a227]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 end-1/4 h-72 w-72 rounded-full bg-[#123047]/50 blur-3xl" />
      <div className="absolute start-6 top-6 flex items-center gap-3 text-white">
        <PixelMark />
        <span className="text-xl font-black tracking-wide">{tr("app")}</span>
      </div>
      <div className="absolute end-6 top-6 flex gap-2">
        <button className="rounded-xl bg-white/10 px-3 py-2 text-sm text-white" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? tr("lightMode") : tr("darkMode")}
        </button>
        <button className="rounded-xl bg-white/10 px-3 py-2 text-sm text-white" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
          {tr("language")}
        </button>
      </div>
      <form
        className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white p-8 shadow-2xl"
        autoComplete="off"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const userInput = form.elements.namedItem("username") as HTMLInputElement | null;
          const passInput = form.elements.namedItem("password") as HTMLInputElement | null;
          const rememberInput = form.elements.namedItem("remember") as HTMLInputElement | null;
          const username = String(userInput?.value || "").trim();
          const password = String(passInput?.value || "");
          const remember = !!rememberInput?.checked;
          setBusy(true);
          setErr("");
          try {
            await login(username, password, remember);
            if (remember) {
              localStorage.setItem(REMEMBER_KEY, "1");
              localStorage.setItem(USER_KEY, username);
            } else {
              localStorage.removeItem(REMEMBER_KEY);
              localStorage.removeItem(USER_KEY);
            }
            nav("/");
          } catch (error) {
            setErr(tr(loginErrKey(error)));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="text-2xl font-black">{tr("welcome")}</div>
        <div className="mt-1 text-sm text-slate-500">{tr("tagline")}</div>
        <div className="mt-6 space-y-3">
          <input
            className={`${inputCls} text-left`}
            name="username"
            type="text"
            inputMode="email"
            dir="ltr"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            placeholder={tr("username")}
            defaultValue={saved ? localStorage.getItem(USER_KEY) || "" : ""}
          />
          <input
            className={`${inputCls} text-left`}
            name="password"
            type="password"
            dir="ltr"
            autoComplete="new-password"
            placeholder={tr("password")}
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="remember" defaultChecked={saved} />
            {tr("rememberMe")}
          </label>
        </div>
        {err ? <div className="mt-3 text-sm text-rose-600">{err}</div> : null}
        <Btn type="submit" disabled={busy} className="mt-5 w-full py-2.5">
          {tr("login")}
        </Btn>
        <p className="mt-4 text-xs leading-5 text-slate-400">{tr("demoHint")}</p>
      </form>
    </div>
  );
}
