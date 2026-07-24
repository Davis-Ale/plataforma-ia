import { RequestHandler } from "express";
import basicAuth = require("express-basic-auth");

export function createBullBoardAuthMiddleware(
  username: string | undefined,
  password: string | undefined,
): RequestHandler {
  if (
    username === undefined ||
    username.trim() === "" ||
    password === undefined ||
    password.trim() === ""
  ) {
    const unavailableMiddleware: RequestHandler = (
      _request,
      response,
    ) => {
      response
        .status(503)
        .send("Bull Board credentials are not configured");
    };

    return unavailableMiddleware;
  }

  return basicAuth({
    challenge: true,
    realm: "Bull Board",
    users: {
      [username]: password,
    },
  });
}
