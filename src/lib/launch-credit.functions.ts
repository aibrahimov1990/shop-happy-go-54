import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getLaunchCreditAdminStatusHandler,
  getOrCreateLaunchCreditHandler,
  killAllLaunchCreditsHandler,
  revokeLaunchCreditHandler,
  setLaunchCreditEnabledHandler,
} from "./launch-credit.handlers.server";

export const getOrCreateLaunchCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(getOrCreateLaunchCreditHandler);

export const revokeLaunchCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string; reason?: string }) => data)
  .handler(revokeLaunchCreditHandler);

export const killAllLaunchCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { reason?: string } | undefined) => data ?? {})
  .handler(killAllLaunchCreditsHandler);

export const getLaunchCreditAdminStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(getLaunchCreditAdminStatusHandler);

export const setLaunchCreditEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { enabled: boolean }) => data)
  .handler(setLaunchCreditEnabledHandler);
