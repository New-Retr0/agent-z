import { createHook } from "workflow";

export type ConfirmResult = { approved: boolean };

export async function awaitDestructiveConfirm(token: string) {
  "use workflow";
  const hook = createHook<ConfirmResult>({ token });
  const r = await hook;
  return r.approved;
}
