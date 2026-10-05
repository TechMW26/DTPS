'use client';

import { useEffect, useRef } from 'react';

/** Keeps responses (including failures) scoped to the current conversation. */
export function useConversationRequests(conversationId: string | null | undefined) {
  const selected = useRef(conversationId);
  selected.current = conversationId;
  const requests = useRef(new Map<string, AbortController>());
  const api = useRef({
    begin(id: string, channel = 'messages', background = false) {
      if (selected.current !== id) return null;
      const previous = requests.current.get(channel);
      // A poll must not supersede the initial load or an existing poll.
      if (background && previous) return null;
      previous?.abort();
      const controller = new AbortController();
      requests.current.set(channel, controller);
      return {
        signal: controller.signal,
        isCurrent: () => selected.current === id && !controller.signal.aborted && requests.current.get(channel) === controller,
        finish: () => {
          if (requests.current.get(channel) === controller) requests.current.delete(channel);
        },
      };
    },
  });
  useEffect(() => {
    // Cancel network work when leaving a conversation or unmounting.
    return () => {
      requests.current.forEach(controller => controller.abort());
      requests.current.clear();
    };
  }, [conversationId]);
  return api.current;
}
