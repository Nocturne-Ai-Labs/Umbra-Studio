export interface PowerPrompterAdmissionGate {
  settled: Promise<void>;
  status: 'pending' | 'accepted' | 'rejected';
  settle: (accepted: boolean) => void;
}

export function createPowerPrompterAdmissionGate(): PowerPrompterAdmissionGate {
  let release = () => {};
  const settled = new Promise<void>((resolve) => { release = resolve; });
  const gate: PowerPrompterAdmissionGate = {
    settled,
    status: 'pending',
    settle(accepted) {
      if (gate.status !== 'pending') return;
      gate.status = accepted ? 'accepted' : 'rejected';
      release();
    },
  };
  return gate;
}

/** Remove and return the first committed head. A held head retains queue order. */
export async function takeAdmittedQueueHead<T extends { admissionGate?: PowerPrompterAdmissionGate }>(
  queue: T[], eligible: (head: T) => boolean = () => true,
): Promise<T | null> {
  while (queue.length > 0) {
    const head = queue[0];
    if (!eligible(head)) return null;
    if (head.admissionGate?.status === 'pending') {
      await head.admissionGate.settled;
      // A group edit can replace a queued head's gate while the original
      // admission is pending. Observe the current gate before dequeuing it.
      continue;
    }
    if (queue[0] !== head) continue;
    queue.shift();
    if (head.admissionGate?.status === 'rejected') continue;
    return head;
  }
  return null;
}
