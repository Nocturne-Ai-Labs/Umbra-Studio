import { Wifi } from 'lucide-react';
import { useI18n } from '@/i18n';

type UmbraRemoteSidebarSectionProps = {
  active: boolean;
  onSelect: () => void;
};

export function UmbraRemoteSidebarSection({ active, onSelect }: UmbraRemoteSidebarSectionProps) {
  const { t } = useI18n();
  return (
    <div className="umbra-sidebar-section bg-black/10 rounded-xl border border-transparent p-2 space-y-1">
      <div className="flex items-center gap-3 px-1 pb-1 text-zinc-400">
        <Wifi size={16} />
        <span className="uppercase tracking-widest text-[10px] font-black">Remote</span>
      </div>

      <button
        onClick={onSelect}
        className={[
          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all neon-glow font-bold',
          active
            ? 'bg-[var(--umbra-accent)] text-white shadow-lg shadow-[var(--umbra-accent-glow)]'
            : 'text-zinc-500 hover:bg-white/5 hover:text-white',
        ].join(' ')}
      >
        <Wifi size={14} />
        <span>{t('nav.umbraRemote')}</span>
      </button>
    </div>
  );
}

export default UmbraRemoteSidebarSection;
