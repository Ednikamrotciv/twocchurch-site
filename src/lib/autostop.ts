/* Live-end watcher (notes 392, 394, 404): intentionally inert — when a broadcast
   ends by itself nothing is written, filed, stamped or toasted. Only the
   office's manual Stop writes an end (and only Stop clears the guest slot);
   a guest ending changes nothing by itself. The hook stays mounted (Admin
   mounts it) so the transport rows keep their shared check, but it never
   writes. */

export function useAutoStopLive(_enabled = true): null {
  return null;
}
