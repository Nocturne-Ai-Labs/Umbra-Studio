// Settings are repeated across thousands of prompts; seeds remain per-prompt.
export function compactQueueSnapshot(snapshot: any): any {
  const generations: Record<string, unknown>[] = [];
  const indices = new Map<string, number>();
  return {
    ...snapshot,
    requests: (snapshot.requests || []).map((request: any) => ({
      ...request,
      prompts: (request.prompts || []).map((prompt: any) => {
        if (!prompt.generation || typeof prompt.generation !== 'object') return prompt;
        const { seed, ...settings } = prompt.generation;
        const key = JSON.stringify(settings);
        let index = indices.get(key);
        if (index === undefined) {
          index = generations.length;
          indices.set(key, index);
          generations.push(settings);
        }
        const rest = { ...prompt };
        delete rest.generation;
        return { ...rest, generationIndex: index, generationSeed: seed };
      }),
    })),
    generations,
  };
}

export function normalizeSnapshotGenerations<T>(snapshot: any, normalize: (value: any) => T): T[] {
  return Array.isArray(snapshot?.generations) ? snapshot.generations.map(normalize) : [];
}
