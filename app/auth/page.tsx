"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { API_BASE, saveSession } from "@/lib/api";
import { useSearchParam } from "@/lib/browser-state";

type Mode = "login" | "register" | "forgot";

const ERR_GENERIC = "เกิดข้อผิดพลาด กรุณาลองใหม่";
const ERR_AUTH = "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง";
const ERR_FORGOT = "ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่";
const ERR_NETWORK = "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่";
const NOTICE_SENT = "ส่งอีเมลลิงก์ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว กรุณาตรวจสอบกล่องจดหมาย";

/** Pull a human-readable message out of FastAPI-style error bodies. */
function readError(data: unknown): string | null {
  const detail = (data as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  return null;
}

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // /auth?mode=register and /auth?next=/th are read straight from the URL, so
  // they survive a reload and need no effect-driven state.
  const nextPath = useSearchParam("next");
  const urlMode = useSearchParam("mode");
  // null = "follow the URL"; a Mode = "the user clicked a toggle".
  const [manualMode, setManualMode] = useState<Mode | null>(null);
  const mode: Mode = manualMode ?? (urlMode === "register" ? "register" : "login");

  const handleGoogleLogin = () => {
    setLoading(true);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- absolute API_BASE + real OAuth hand-off, not an internal route
    window.location.href = `${API_BASE}/api/auth/google`;
  };

  const switchMode = (m: Mode) => {
    setManualMode(m);
    setError("");
    setNotice("");
  };

  // Login is email + password only. No 2FA, no SMS OTP, no prompt injection
  // and no reCAPTCHA.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    const address = email.trim().toLowerCase();

    // ---- forgot password ----
    if (mode === "forgot") {
      try {
        const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: address }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(readError(data) || ERR_FORGOT);
        } else {
          setNotice(
            (data as { message?: string })?.message || NOTICE_SENT
          );
          setManualMode("login");
        }
      } catch {
        setError(ERR_NETWORK);
      }
      setLoading(false);
      return;
    }

    // ---- register / login ----
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(readError(data) || ERR_AUTH);
        setLoading(false);
        return;
      }

      const { token, user } = data as { token?: string; user?: unknown };
      if (!token) {
        setError(ERR_GENERIC);
        setLoading(false);
        return;
      }

      saveSession(token, user);
      // Chat is the default landing; "/" stays the marketing page.
      router.push(nextPath || "/th");
    } catch {
      setError(ERR_NETWORK);
      setLoading(false);
    }
  };

  // Handle the backend OAuth callback (?token=...&user=...). ?next= and ?mode=
  // are already handled by useSearchParam above, so this only navigates.
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    const user = urlParams.get("user");

    if (token && user) {
      saveSession(token, user);
      router.replace(urlParams.get("next") || "/th");
    }
  }, [router]);

  const heading =
    mode === "login"
      ? "Welcome back"
      : mode === "register"
        ? "Create your account"
        : "ลืมรหัสผ่าน";
  const subheading =
    mode === "login"
      ? "Sign in to continue to Vihok AI"
      : mode === "register"
        ? "Sign up with email and password"
        : "กรอกอีเมลที่ใช้ลงทะเบียนไว้";
  const passwordHint = "รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4">
      <div className="w-full max-w-md rounded-3xl border border-white/5 bg-[#1a1a1a] p-8 shadow-2xl">
        <div className="mb-8 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl font-bold text-black">
            V
          </div>
        </div>

        <h1 className="mb-2 text-center text-2xl font-bold text-white">{heading}</h1>
        <p className="mb-6 text-center text-sm text-white/40">{subheading}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@gmail.com"
            autoComplete="email"
            required
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
          />

          {mode !== "forgot" && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={passwordHint}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={8}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-white py-3 font-semibold text-black transition hover:bg-gray-200 disabled:opacity-50"
          >
            {loading
              ? mode === "forgot"
                ? "กำลังส่ง..."
                : mode === "login"
                  ? "Signing in..."
                  : "Creating account..."
              : mode === "forgot"
                ? "ส่งอีเมลตั้งรหัสผ่านใหม่"
                : mode === "login"
                  ? "Sign In"
                  : "Sign Up"}
          </button>

          {mode === "login" && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => switchMode("forgot")}
                className="text-sm text-white/40 transition hover:text-white/70"
              >
                ลืมรหัสผ่าน?
              </button>
            </div>
          )}

          <p className="text-center text-sm text-white/40">
            {mode === "forgot" ? (
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="font-medium text-white hover:underline"
              >
                &#8592; กลับสู่หน้าล็อกอิน
              </button>
            ) : (
              <>
                {mode === "login" ? "ยังไม่มีบัญชี?" : "มีบัญชีอยู่แล้ว?"}{" "}
                <button
                  type="button"
                  onClick={() => switchMode(mode === "login" ? "register" : "login")}
                  className="font-medium text-white hover:underline"
                >
                  {mode === "login" ? "สมัครใช้งาน" : "เข้าสู่ระบบ"}
                </button>
              </>
            )}
          </p>
        </form>

        {notice && (
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-center text-sm text-emerald-300">
            {notice}
          </div>
        )}

        {mode !== "forgot" && (
          <>
            <div className="my-6 flex items-center gap-4">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs uppercase text-white/20">or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="space-y-3">
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 py-3 transition hover:bg-white/10 disabled:opacity-50"
              >
                <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
                  <path
                    fill="#FFC107"
                    d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
                  />
                  <path
                    fill="#FF3D00"
                    d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
                  />
                  <path
                    fill="#4CAF50"
                    d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
                  />
                  <path
                    fill="#1976D2"
                    d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
                  />
                </svg>
                <span className="font-medium text-white">Continue with Google</span>
              </button>
            </div>
          </>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-sm text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
