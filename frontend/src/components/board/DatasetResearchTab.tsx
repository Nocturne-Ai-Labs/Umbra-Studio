import { useState } from 'react';
import { BarChart3, Copy, ExternalLink, Loader2, Search, Sparkles } from 'lucide-react';
import { useBoardStore } from './hooks/useBoardStore';

type ResearchMode = 'character' | 'artist' | 'concept';

type ResearchTag = {
  tag: string;
  count: number;
  percent: number;
  category: string;
};

type ResearchResult = {
  ok: boolean;
  mode: ResearchMode;
  query: string;
  searchTags: string;
  postCount: number;
  sourceUrl: string;
  suggestedTrigger: string;
  buckets: {
    identity: ResearchTag[];
    core: ResearchTag[];
    variable: ResearchTag[];
    bias: ResearchTag[];
    adult?: ResearchTag[];
    general: ResearchTag[];
    character: ResearchTag[];
    artist: ResearchTag[];
    copyright: ResearchTag[];
    meta: ResearchTag[];
  };
  ratings: Record<string, number>;
};

function TagBucket({
  title,
  tags,
  postCount,
  onCopy,
  onCopyOne,
  copiedKey,
}: {
  title: string;
  tags: ResearchTag[];
  postCount: number;
  onCopy: (tags: ResearchTag[]) => void;
  onCopyOne: (bucket: string, tag: string) => void;
  copiedKey: string;
}) {
  const bucketKey = title.toLowerCase().replace(/\s+/g, '-');
  const bucketCopied = copiedKey === `${bucketKey}:bucket`;
  return (
    <section className="min-h-0 rounded-md border border-white/10 bg-white/[0.025] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-200">{title}</h3>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-600">{tags.length} tags</p>
        </div>
        <button
          onClick={() => onCopy(tags)}
          disabled={tags.length === 0}
          className={`rounded border p-1.5 text-[10px] font-bold uppercase tracking-wide transition disabled:opacity-35 ${
            bucketCopied ? 'border-emerald-300/45 bg-emerald-500/15 text-emerald-100' : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:text-zinc-100'
          }`}
          title={`Copy ${title} tags`}
        >
          {bucketCopied ? 'Copied' : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="custom-scrollbar flex max-h-52 flex-wrap content-start gap-1.5 overflow-y-auto">
        {tags.map(tag => (
          <button
            key={`${title}-${tag.tag}`}
            type="button"
            onClick={() => onCopyOne(bucketKey, tag.tag)}
            className={`rounded border px-2 py-1 text-left text-[11px] transition ${
              copiedKey === `${bucketKey}:${tag.tag}`
                ? 'border-emerald-300/50 bg-emerald-500/15 text-emerald-100'
                : 'border-white/10 bg-black/25 text-zinc-300 hover:border-cyan-400/45 hover:bg-cyan-500/10 hover:text-cyan-100'
            }`}
            title={`Copy ${tag.tag} - ${tag.count}/${postCount} posts`}
          >
            {copiedKey === `${bucketKey}:${tag.tag}` ? 'Copied ' : null}{tag.tag}
            <span className="ml-1 text-cyan-200/80">{tag.percent}%</span>
          </button>
        ))}
        {tags.length === 0 ? <span className="text-xs text-zinc-600">No tags in this bucket.</span> : null}
      </div>
    </section>
  );
}

export function DatasetResearchTab({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const { addSearchTab, searchTabs, activeSearchTabId, setActiveSearchTab, updateSearchTab } = useBoardStore();
  const [researchMode, setResearchMode] = useState<ResearchMode>('character');
  const [researchQuery, setResearchQuery] = useState('');
  const [researchExtraTags, setResearchExtraTags] = useState('rating:safe');
  const [researchLimit, setResearchLimit] = useState(200);
  const [isResearching, setIsResearching] = useState(false);
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);
  const [researchError, setResearchError] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  const markCopied = (key: string) => {
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((current) => current === key ? '' : current);
    }, 1200);
  };

  const runDatasetResearch = async () => {
    if (!researchQuery.trim()) return;
    setIsResearching(true);
    setResearchError('');
    try {
      const params = new URLSearchParams({
        source: 'danbooru',
        mode: researchMode,
        query: researchQuery,
        extraTags: researchExtraTags,
        limit: String(researchLimit),
      });
      const response = await fetch(`/api/booru/research?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Dataset research failed');
      setResearchResult(data);
    } catch (error: any) {
      setResearchError(error?.message || 'Dataset research failed');
    } finally {
      setIsResearching(false);
    }
  };

  const copyTags = async (tags: ResearchTag[]) => {
    const text = tags.map(tag => tag.tag).join(', ');
    if (!text) return;
    await navigator.clipboard?.writeText(text).catch(() => {});
  };

  const copyBucketTags = async (bucket: string, tags: ResearchTag[]) => {
    await copyTags(tags);
    if (tags.length > 0) markCopied(`${bucket}:bucket`);
  };

  const copyOneTag = async (bucket: string, tag: string) => {
    if (!tag) return;
    await navigator.clipboard?.writeText(tag).catch(() => {});
    markCopied(`${bucket}:${tag}`);
  };

  const sendToSearch = (tags: ResearchTag[]) => {
    const query = tags.map(tag => tag.tag).join(' ');
    if (!query) return;
    let targetId = activeSearchTabId || searchTabs[0]?.id || '';
    if (!targetId) {
      addSearchTab();
      targetId = useBoardStore.getState().activeSearchTabId || '';
    }
    if (targetId) {
      updateSearchTab(targetId, {
        tags: query,
        name: researchResult?.suggestedTrigger || 'Research',
      });
      setActiveSearchTab(targetId);
    }
    onOpenSearch?.();
  };

  const suggestedSearchTags = researchResult
    ? [
        { tag: researchResult.query, count: researchResult.postCount, percent: 100, category: researchResult.mode },
        ...researchResult.buckets.core.slice(0, 10),
      ]
    : [];

  return (
    <div className="flex h-full min-h-0 bg-[var(--umbra-bg)] text-[var(--umbra-text)]" style={{ fontFamily: 'var(--font-family)' }}>
      <aside className="glass-panel custom-scrollbar w-80 shrink-0 overflow-y-auto rounded-none border-y-0 border-l-0 p-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-cyan-200" />
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-100">Dataset Research</h2>
        </div>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Build a tag profile from Danbooru posts before making a dataset.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Mode</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['character', 'artist', 'concept'] as ResearchMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setResearchMode(mode)}
                  className={`rounded-md border px-2 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${
                    researchMode === mode ? 'border-cyan-400/45 bg-cyan-500/15 text-cyan-100' : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Target Tag</label>
            <input
              value={researchQuery}
              onChange={(event) => setResearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runDatasetResearch();
              }}
              placeholder="character_name, artist_name, concept_tag"
              className="settings-input !py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Filters</label>
            <input
              value={researchExtraTags}
              onChange={(event) => setResearchExtraTags(event.target.value)}
              placeholder="rating:safe score:>20"
              className="settings-input !py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Sample Posts</label>
            <input
              type="number"
              min={20}
              max={500}
              value={researchLimit}
              onChange={(event) => setResearchLimit(Math.max(20, Math.min(500, Number(event.target.value) || 200)))}
              className="settings-input !py-2 text-sm"
            />
          </div>

          <button
            onClick={() => void runDatasetResearch()}
            disabled={isResearching || !researchQuery.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-cyan-400/35 bg-cyan-500/15 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-40"
          >
            {isResearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Analyze Tags
          </button>
        </div>
      </aside>

      <main className="custom-scrollbar min-w-0 flex-1 overflow-y-auto p-5">
        {researchError ? (
          <div className="mb-4 rounded-md border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">{researchError}</div>
        ) : null}

        {!researchResult ? (
          <div className="flex h-full min-h-[360px] items-center justify-center rounded-md border border-dashed border-white/10 bg-white/[0.02] text-center">
            <div>
              <BarChart3 className="mx-auto h-8 w-8 text-zinc-600" />
              <div className="mt-3 text-sm font-bold text-zinc-300">No research profile yet</div>
              <div className="mt-1 text-xs text-zinc-600">Choose a mode, enter a tag, and analyze.</div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-md border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200">{researchResult.mode}</div>
                  <h2 className="mt-1 truncate text-xl font-black text-zinc-100">{researchResult.suggestedTrigger}</h2>
                  <div className="mt-1 text-xs text-zinc-500">{researchResult.postCount} posts analyzed from Danbooru</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => sendToSearch(suggestedSearchTags)}
                    className="flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-emerald-100"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Send To Search
                  </button>
                  <a
                    href={researchResult.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-black uppercase tracking-widest text-zinc-300"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Danbooru
                  </a>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <TagBucket title="Identity" tags={researchResult.buckets.identity} postCount={researchResult.postCount} onCopy={(tags) => void copyBucketTags('identity', tags)} onCopyOne={copyOneTag} copiedKey={copiedKey} />
              <TagBucket title="Core Tags" tags={researchResult.buckets.core} postCount={researchResult.postCount} onCopy={(tags) => void copyBucketTags('core-tags', tags)} onCopyOne={copyOneTag} copiedKey={copiedKey} />
              <TagBucket title="Variable Tags" tags={researchResult.buckets.variable} postCount={researchResult.postCount} onCopy={(tags) => void copyBucketTags('variable-tags', tags)} onCopyOne={copyOneTag} copiedKey={copiedKey} />
              <TagBucket title="Adult / Sensitive" tags={researchResult.buckets.adult || []} postCount={researchResult.postCount} onCopy={(tags) => void copyBucketTags('adult-/-sensitive', tags)} onCopyOne={copyOneTag} copiedKey={copiedKey} />
              <TagBucket title="Bias Warnings" tags={researchResult.buckets.bias} postCount={researchResult.postCount} onCopy={(tags) => void copyBucketTags('bias-warnings', tags)} onCopyOne={copyOneTag} copiedKey={copiedKey} />
              <TagBucket title="General Frequency" tags={researchResult.buckets.general} postCount={researchResult.postCount} onCopy={(tags) => void copyBucketTags('general-frequency', tags)} onCopyOne={copyOneTag} copiedKey={copiedKey} />
              <TagBucket title="Character" tags={researchResult.buckets.character} postCount={researchResult.postCount} onCopy={(tags) => void copyBucketTags('character', tags)} onCopyOne={copyOneTag} copiedKey={copiedKey} />
              <TagBucket title="Artist" tags={researchResult.buckets.artist} postCount={researchResult.postCount} onCopy={(tags) => void copyBucketTags('artist', tags)} onCopyOne={copyOneTag} copiedKey={copiedKey} />
              <TagBucket title="Copyright" tags={researchResult.buckets.copyright} postCount={researchResult.postCount} onCopy={(tags) => void copyBucketTags('copyright', tags)} onCopyOne={copyOneTag} copiedKey={copiedKey} />
              <TagBucket title="Meta" tags={researchResult.buckets.meta} postCount={researchResult.postCount} onCopy={(tags) => void copyBucketTags('meta', tags)} onCopyOne={copyOneTag} copiedKey={copiedKey} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
