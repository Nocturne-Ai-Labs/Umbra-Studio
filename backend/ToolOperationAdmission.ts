export type ToolOperationClaim = {
  tool: string; action: string; actionId?: string; startedAt: number;
  release(): void;
};

export function createToolOperationAdmission(externalBusy: (tool: string) => { tool: string; action: string; startedAt: number } | null = () => null) {
  const active = new Map<string, ToolOperationClaim>();
  return {
    get(tool: string) {
      const claim = active.get(tool);
      return claim ? { tool, action: claim.action, actionId: claim.actionId, startedAt: claim.startedAt } : externalBusy(tool);
    },
    claim(tool: string, action: string): ToolOperationClaim | null {
      if (active.has(tool) || externalBusy(tool)) return null;
      const claim: ToolOperationClaim = { tool, action, startedAt: Date.now(), release() {
        if (active.get(tool) === claim) active.delete(tool);
      } };
      active.set(tool, claim);
      return claim;
    },
  };
}
