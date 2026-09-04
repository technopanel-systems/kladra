/**
 * Auth.js's own endpoints (/api/auth/*). The session, sign-in and sign-out
 * actions are called in-process by src/actions/auth.ts, but Auth.js still
 * needs this route to exist for CSRF and provider metadata. src/proxy.ts
 * excludes /api from locale routing, so these URLs carry no locale prefix.
 */
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
