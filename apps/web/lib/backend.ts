import { cookies } from "next/headers";

const ACCESS_COOKIE = "plataforma_access";
const REFRESH_COOKIE = "plataforma_refresh";

function baseUrl() {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1").replace(/\/$/, "");
}

export function backendFetch(
  path: string,
  init?: RequestInit,
) {
  return fetch(`${baseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    redirect: "error",
  });
}

export async function setSessionCookies(data: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}) {
  const store = await cookies();
  const secure = process.env.NODE_ENV === "production";

  store.set(ACCESS_COOKIE, data.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: data.expiresIn,
  });
  store.set(REFRESH_COOKIE, data.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: data.refreshExpiresIn,
  });
}

export async function clearSessionCookies() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

async function refreshSession() {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return null;
  }

  const response = await backendFetch("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    await clearSessionCookies();
    return null;
  }

  const data = await response.json() as {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
  };
  await setSessionCookies(data);
  return data.accessToken;
}

export async function authorizedBackendFetch(
  path: string,
  init?: RequestInit,
) {
  const store = await cookies();
  let accessToken = store.get(ACCESS_COOKIE)?.value ?? null;

  if (!accessToken) {
    accessToken = await refreshSession();
  }

  if (!accessToken) {
    return new Response(null, { status: 401 });
  }

  const request = () => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    return backendFetch(path, {
      ...init,
      headers,
    });
  };

  let response = await request();

  if (response.status === 401) {
    accessToken = await refreshSession();
    if (!accessToken) {
      return response;
    }
    response = await request();
  }

  return response;
}
