/* The automatic stop was removed at the office's request: when a broadcast
   ends on YouTube, the site does nothing by itself — no draft write, no
   Recent-services filing, no toast, no publish. The office ends the stream
   with Stop, then Publish, exactly like any other change. This hook stays
   mounted in #/admin as the documented home of that rule, but it is inert:
   the transport rows keep their own on-air lights through their own
   subscriptions while the drawer is open. */

/** Inert: watches nothing, writes nothing, files nothing, toasts nothing. */
export function useAutoStopLive(_enabled = true): null {
  return null;
}
