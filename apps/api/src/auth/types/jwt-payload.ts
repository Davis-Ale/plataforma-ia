export type JwtTokenType = "access" | "refresh";

export type JwtPayload = {
  sub: string;
  email: string;
  type: JwtTokenType;
  sessionId: string;
};
